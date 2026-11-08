/**
 * Deterministic shopping-cart logic. The AI only reports what each turn said
 * (see lib/summary.ts); every match, merge, conversion and total is computed
 * here. Pure functions only: ids and timestamps come in with each action.
 *
 * Only runtime-free `import type` is used so `node --test` can load this file.
 */
import type {
  Cart,
  CartItem,
  CartItemSource,
  CartSignal,
  ItemProblem,
  Purchase,
  Quantity,
  Unit,
  UnitPrice,
} from "@/lib/types/cart";
import type { Role } from "@/lib/types/conversation";

export const UNITS: readonly Unit[] = ["kg", "g", "l", "ml", "piece", "dozen"];

type Dimension = "mass" | "volume" | "count";

/** Exact, definitional conversions only (1 kg = 1000 g, 1 l = 1000 ml, 1 dozen = 12 pieces). */
const UNIT_INFO: Record<Unit, { dimension: Dimension; factor: number; one: string; many: string }> = {
  kg: { dimension: "mass", factor: 1000, one: "kg", many: "kg" },
  g: { dimension: "mass", factor: 1, one: "g", many: "g" },
  l: { dimension: "volume", factor: 1000, one: "litre", many: "litres" },
  ml: { dimension: "volume", factor: 1, one: "ml", many: "ml" },
  piece: { dimension: "count", factor: 1, one: "piece", many: "pieces" },
  dozen: { dimension: "count", factor: 12, one: "dozen", many: "dozen" },
};

const UNIT_ALIASES: Record<string, Unit> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", kilogramme: "kg", kilogrammes: "kg",
  g: "g", gm: "g", gms: "g", gr: "g", gram: "g", grams: "g", gramme: "g", grammes: "g",
  l: "l", lt: "l", ltr: "l", ltrs: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", nos: "piece", no: "piece", unit: "piece", units: "piece", each: "piece",
  dozen: "dozen", dozens: "dozen", doz: "dozen",
};

/** Maps a unit as written by the model or a person to a known unit, or null. */
export function normalizeUnit(raw: unknown): Unit | null {
  if (typeof raw !== "string") return null;
  return UNIT_ALIASES[raw.trim().toLowerCase().replace(/\.$/, "")] ?? null;
}

export function unitsCompatible(a: Unit, b: Unit) {
  return UNIT_INFO[a].dimension === UNIT_INFO[b].dimension;
}

export function convert(value: number, from: Unit, to: Unit) {
  return (value * UNIT_INFO[from].factor) / UNIT_INFO[to].factor;
}

/** Avoids 0.1 + 0.2 style noise in quantities. */
const tidy = (n: number) => Math.round(n * 1e6) / 1e6;

export function sameQuantity(a: Quantity, b: Quantity) {
  if (a.unit === null || b.unit === null) return a.unit === b.unit && a.value === b.value;
  return unitsCompatible(a.unit, b.unit) && tidy(convert(b.value, b.unit, a.unit)) === tidy(a.value);
}

/** a + b in a's unit, or null when the units cannot be combined. */
export function addQuantities(a: Quantity, b: Quantity): Quantity | null {
  if (a.unit === null || b.unit === null) return a.unit === b.unit ? { value: tidy(a.value + b.value), unit: null } : null;
  if (!unitsCompatible(a.unit, b.unit)) return null;
  return { value: tidy(a.value + convert(b.value, b.unit, a.unit)), unit: a.unit };
}

function samePrice(a: UnitPrice, b: UnitPrice) {
  return a.amount === b.amount && a.forValue === b.forValue && a.unit === b.unit;
}

const normWords = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // "tomatoes" / "tomato", "onions" / "onion", "chillies" / "chilli" share a key.
    .map((w) => w.replace(/s$/, "").replace(/e$/, ""))
    .join(" ");

/** Matching key for a product: normalised name, plus variant when there is one. */
export function itemKey(name: string, variant: string | null) {
  const base = normWords(name);
  const v = variant ? normWords(variant) : "";
  return v && v !== base ? `${base}|${v}` : base;
}
const baseOf = (key: string) => key.split("|")[0];

// ---------- Money and validation ----------

/** Item total in paise, or null unless quantity and price are complete and in compatible units. */
export function itemTotalPaise(item: Pick<CartItem, "quantity" | "price">): number | null {
  const { quantity: q, price: p } = item;
  if (!q || !p || !q.unit || !p.unit || !unitsCompatible(q.unit, p.unit)) return null;
  if (!(q.value > 0) || !(p.forValue > 0) || !(p.amount >= 0)) return null;
  const qtyBase = q.value * UNIT_INFO[q.unit].factor;
  const priceBase = p.forValue * UNIT_INFO[p.unit].factor;
  return Math.round((Math.round(p.amount * 100) * qtyBase) / priceBase);
}

export function itemProblems(item: CartItem): ItemProblem[] {
  const problems: ItemProblem[] = [];
  if (item.question) problems.push("question");
  if (item.confirmation === "needs_review") problems.push("needs_review");
  if (!item.quantity) problems.push("quantity_missing");
  if (!item.price) problems.push("price_missing");
  if (item.quantity && item.price && itemTotalPaise(item) === null) problems.push("unit_mismatch");
  return problems;
}

export const PROBLEM_TEXT: Record<ItemProblem, string> = {
  question: "Needs your answer",
  needs_review: "Please check this item",
  quantity_missing: "Quantity missing",
  price_missing: "Price not given by the vendor yet",
  unit_mismatch: "Please confirm quantity or price.",
};

/** The grand total is only given when every item is complete and nothing is unclear. */
export function cartSummary(cart: Pick<Cart, "items">) {
  const withProblems = cart.items.filter((i) => itemProblems(i).length > 0).length;
  const valid = cart.items.length > 0 && withProblems === 0;
  return {
    count: cart.items.length,
    withProblems,
    grandTotalPaise: valid ? cart.items.reduce((sum, i) => sum + (itemTotalPaise(i) ?? 0), 0) : null,
  };
}

// ---------- Formatting ----------

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const rupeesWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatPaise(paise: number) {
  return (paise % 100 === 0 ? rupeesWhole : rupees).format(paise / 100);
}

const num = (n: number) => String(tidy(n));

export function formatQuantity(q: Quantity) {
  if (!q.unit) return `${num(q.value)} (unit unclear)`;
  const info = UNIT_INFO[q.unit];
  return `${num(q.value)} ${q.value === 1 ? info.one : info.many}`;
}

export function formatPrice(p: UnitPrice) {
  const amount = formatPaise(Math.round(p.amount * 100));
  if (!p.unit) return `${amount} (for what is unclear)`;
  return p.forValue === 1 ? `${amount}/${UNIT_INFO[p.unit].one}` : `${amount} for ${formatQuantity({ value: p.forValue, unit: p.unit })}`;
}

export const unitLabel = (u: Unit) => UNIT_INFO[u].one;

// ---------- Reducer ----------

/** One product mention in one turn, as returned by /api/summary. */
export interface ExtractedItem {
  product: string;
  quote: string;
  uncertain: boolean;
  note?: string;
  cart: CartSignal;
}

export interface ExtractedTurn {
  id: string;
  role: Role;
  items: ExtractedItem[];
}

export type CartCommand =
  | { type: "apply_turns"; at: string; turns: ExtractedTurn[] }
  | { type: "edit"; at: string; id: string; quantity: Quantity | null; price: UnitPrice | null }
  | { type: "remove"; at: string; id: string }
  | { type: "mark_checked"; at: string; id: string }
  | { type: "answer"; at: string; id: string; choice: "add" | "replace" | "remove" | "keep" }
  | { type: "add_manual"; at: string; id: string; name: string; quantity: Quantity | null; price: UnitPrice | null }
  | { type: "review"; at: string }
  | { type: "back"; at: string }
  /** After a purchase is saved: a fresh cart that remembers which turns were already used. */
  | { type: "new_cart"; at: string; id: string };

export function createCart(id: string, at: string): Cart {
  return { id, status: "active", items: [], createdAt: at, updatedAt: at, pendingPrices: {}, appliedTurnIds: [] };
}

const MAX_SOURCES = 6;
const withSource = (item: CartItem, source: CartItemSource): CartItem => ({
  ...item,
  sources: [...item.sources, source].slice(-MAX_SOURCES),
});

/**
 * Finds the cart item a mention refers to: same key first, else the only item
 * with the same product name. With a quantity, prefers an entry whose unit fits.
 */
function findItem(items: CartItem[], key: string, quantity: Quantity | null, fallback: boolean): CartItem | undefined {
  let candidates = items.filter((i) => i.key === key);
  // "onions" may refer to the one onion entry, whatever its variant; "red onions" is its own product.
  if (candidates.length === 0 && !key.includes("|")) {
    const sameBase = items.filter((i) => baseOf(i.key) === baseOf(key));
    if (sameBase.length === 1) candidates = sameBase;
  }
  const unit = quantity?.unit;
  if (!unit) return candidates[0];
  const fits = candidates.filter((i) => !i.quantity?.unit || unitsCompatible(i.quantity.unit, unit));
  return fits[0] ?? (fallback ? candidates[0] : undefined);
}

const incompatible = (a: Quantity | null, b: Quantity | null) =>
  Boolean(a?.unit && b?.unit && !unitsCompatible(a.unit, b.unit));

function applyMention(cart: Cart, turn: ExtractedTurn, mention: ExtractedItem, index: number): Cart {
  const sig = mention.cart;
  const name = mention.product.trim();
  if (!name) return cart;
  const variant = sig.variant?.trim() || null;
  const key = itemKey(name, variant);
  const source: CartItemSource = { speaker: turn.role, quote: mention.quote, turnId: turn.id };
  const doubt = mention.uncertain;
  const notes = mention.note ? [mention.note] : [];
  const items = cart.items;

  const replace = (next: CartItem) => ({ ...cart, items: items.map((i) => (i.id === next.id ? next : i)) });

  const create = (quantity: Quantity | null): Cart => {
    const pending = cart.pendingPrices[key] ?? cart.pendingPrices[baseOf(key)];
    const pendingPrices = { ...cart.pendingPrices };
    delete pendingPrices[key];
    delete pendingPrices[baseOf(key)];
    const item: CartItem = {
      id: `${turn.id}-${index}`,
      name,
      variant,
      key,
      quantity,
      price: pending?.price ?? null,
      confirmation: doubt || pending?.needsReview ? "needs_review" : "pending",
      notes,
      sources: pending ? [pending.source, source] : [source],
    };
    return { ...cart, items: [...items, item], pendingPrices };
  };

  if (sig.action === "price") {
    if (turn.role !== "vendor" || !sig.price) return cart;
    // Falls back to the product's only entry even if units differ, so the mismatch is shown, not hidden.
    const target = findItem(items, key, sig.price.unit ? { value: sig.price.forValue, unit: sig.price.unit } : null, true);
    if (!target) {
      return { ...cart, pendingPrices: { ...cart.pendingPrices, [key]: { price: sig.price, source, needsReview: doubt } } };
    }
    const corrected = target.price !== null && !samePrice(target.price, sig.price);
    return replace(
      withSource(
        {
          ...target,
          price: sig.price,
          priceCorrected: target.priceCorrected || corrected,
          // A changed price must be checked again, even if the customer already confirmed the item.
          confirmation: doubt ? "needs_review" : corrected && target.confirmation === "confirmed" ? "pending" : target.confirmation,
          notes: corrected ? [...target.notes, `Vendor changed the price from ${formatPrice(target.price!)}`, ...notes] : [...target.notes, ...notes],
        },
        source,
      ),
    );
  }

  // Only the customer changes what is in the cart.
  if (turn.role !== "customer" || sig.action === "other") return cart;
  const found = findItem(items, key, sig.quantity, false);
  // Different kinds of unit (e.g. kg and pieces) of one product stay as separate entries.
  const existing = (sig.action === "add" || sig.action === "add_more") && incompatible(found?.quantity ?? null, sig.quantity) ? undefined : found;
  const flagged = (item: CartItem): CartItem =>
    doubt ? { ...item, confirmation: "needs_review", notes: [...item.notes, ...notes] } : { ...item, notes: [...item.notes, ...notes] };

  switch (sig.action) {
    case "add": {
      if (!existing) return create(sig.quantity);
      if (!sig.quantity || (existing.quantity && sameQuantity(existing.quantity, sig.quantity))) {
        return replace(withSource(flagged(existing), source)); // the same request repeated
      }
      if (!existing.quantity) return replace(withSource(flagged({ ...existing, quantity: sig.quantity }), source));
      // Same product, a different amount, and no word on whether it is more or a correction: ask.
      return replace(withSource({ ...existing, question: { kind: "add_or_replace", quantity: sig.quantity } }, source));
    }
    case "add_more": {
      if (!existing) return create(sig.quantity);
      if (!sig.quantity) {
        return replace(
          withSource({ ...existing, confirmation: "needs_review", notes: [...existing.notes, "Customer asked for more, but not how much"] }, source),
        );
      }
      if (!existing.quantity) return replace(withSource(flagged({ ...existing, quantity: sig.quantity }), source));
      const sum = addQuantities(existing.quantity, sig.quantity);
      if (!sum) {
        return replace(withSource({ ...existing, confirmation: "needs_review", notes: [...existing.notes, "Extra amount given without a clear unit"] }, source));
      }
      return replace(withSource(flagged({ ...existing, quantity: sum }), source));
    }
    case "set_quantity": {
      if (!existing) return create(sig.quantity);
      if (!sig.quantity) {
        return replace(
          withSource({ ...existing, confirmation: "needs_review", notes: [...existing.notes, "Customer changed the amount, but the new amount was not clear"] }, source),
        );
      }
      const changed: CartItem = { ...existing, quantity: sig.quantity, question: undefined };
      return replace(withSource(flagged(existing.confirmation === "confirmed" ? { ...changed, confirmation: "pending" } : changed), source));
    }
    case "remove": {
      if (!existing) return cart;
      if (doubt) return replace(withSource({ ...existing, question: { kind: "remove" }, notes: [...existing.notes, ...notes] }, source));
      return { ...cart, items: items.filter((i) => i.id !== existing.id) };
    }
  }
}

export function cartReducer(cart: Cart, command: CartCommand): Cart {
  const touched = (next: Cart): Cart => (next === cart ? cart : { ...next, updatedAt: command.at });
  const update = (id: string, fn: (item: CartItem) => CartItem | null) =>
    touched({
      ...cart,
      items: cart.items.flatMap((i) => {
        if (i.id !== id) return [i];
        const next = fn(i);
        return next ? [next] : [];
      }),
    });

  switch (command.type) {
    case "apply_turns": {
      let next = cart;
      for (const turn of command.turns) {
        if (next.appliedTurnIds.includes(turn.id)) continue;
        next = turn.items.reduce((c, mention, i) => applyMention(c, turn, mention, i), next);
        next = { ...next, appliedTurnIds: [...next.appliedTurnIds, turn.id] };
      }
      return touched(next);
    }
    case "edit":
      return update(command.id, (i) => ({
        ...withSource(i, { speaker: "manual" }),
        quantity: command.quantity,
        price: command.price,
        question: undefined,
        confirmation: "confirmed",
        notes: [],
      }));
    case "remove":
      return update(command.id, () => null);
    case "mark_checked":
      return update(command.id, (i) => (i.question ? i : { ...i, confirmation: "confirmed" }));
    case "answer":
      return update(command.id, (i) => {
        const q = i.question;
        if (!q) return i;
        if (command.choice === "remove") return null;
        if (command.choice === "keep") return { ...i, question: undefined, confirmation: "confirmed" };
        if (q.kind !== "add_or_replace") return i;
        const quantity = command.choice === "add" && i.quantity ? addQuantities(i.quantity, q.quantity) : q.quantity;
        return { ...i, quantity: quantity ?? q.quantity, question: undefined, confirmation: "confirmed" };
      });
    case "add_manual": {
      const name = command.name.trim();
      if (!name) return cart;
      const item: CartItem = {
        id: command.id,
        name,
        variant: null,
        key: itemKey(name, null),
        quantity: command.quantity,
        price: command.price,
        confirmation: "confirmed",
        notes: [],
        sources: [{ speaker: "manual" }],
      };
      return touched({ ...cart, items: [...cart.items, item] });
    }
    case "review":
      return cart.items.length ? touched({ ...cart, status: "reviewing" }) : cart;
    case "back":
      return touched({ ...cart, status: "active" });
    case "new_cart":
      return { ...createCart(command.id, command.at), appliedTurnIds: cart.appliedTurnIds, pendingPrices: cart.pendingPrices };
  }
}

/** The record saved after the customer confirms, or null if the cart is not complete. */
export function buildPurchase(cart: Cart, id: string, at: string): Purchase | null {
  const { grandTotalPaise } = cartSummary(cart);
  if (grandTotalPaise === null) return null;
  return {
    id,
    cartId: cart.id,
    status: "confirmed",
    createdAt: cart.createdAt,
    confirmedAt: at,
    grandTotalPaise,
    items: cart.items.map((i) => ({
      id: i.id,
      name: i.name,
      variant: i.variant,
      quantity: i.quantity!,
      price: i.price!,
      totalPaise: itemTotalPaise(i)!,
    })),
  };
}
