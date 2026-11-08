"use client";

import { useState } from "react";
import type { CartController } from "@/hooks/use-cart";
import {
  addQuantities,
  cartSummary,
  formatPaise,
  formatPrice,
  formatQuantity,
  itemProblems,
  itemTotalPaise,
  PROBLEM_TEXT,
  unitLabel,
  UNITS,
} from "@/lib/cart/cart";
import type { CartItem, Quantity, Unit, UnitPrice } from "@/lib/types/cart";
import { CheckIcon, Spinner } from "./icons";

const smallButton =
  "min-h-10 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-text hover:bg-raised disabled:opacity-40 sm:min-h-0";
const primaryButton =
  "min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100";
const field = "w-full min-w-0 rounded-lg border border-line bg-raised px-2.5 py-2 text-sm text-text";

function lastHeard(item: CartItem) {
  return [...item.sources].reverse().find((s) => s.speaker !== "manual" && s.quote);
}

// ---------- Item form (edit, or add by hand) ----------

function parseNumber(s: string) {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function ItemForm({
  item,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /** Absent when adding a new item by hand. */
  item?: CartItem;
  submitLabel: string;
  onSubmit: (name: string, quantity: Quantity | null, price: UnitPrice | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [qty, setQty] = useState(item?.quantity ? String(item.quantity.value) : "");
  const [qtyUnit, setQtyUnit] = useState<Unit | "">(item?.quantity?.unit ?? "");
  const [amount, setAmount] = useState(item?.price ? String(item.price.amount) : "");
  const [perQty, setPerQty] = useState(item?.price ? String(item.price.forValue) : "1");
  const [perUnit, setPerUnit] = useState<Unit | "">(item?.price?.unit ?? item?.quantity?.unit ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item && !name.trim()) return setError("Enter the product name.");
    const q = parseNumber(qty);
    const a = parseNumber(amount);
    const per = parseNumber(perQty) ?? 1;
    if (q !== null && !(q > 0)) return setError("Quantity must be a number above 0.");
    if (q !== null && !qtyUnit) return setError("Choose a unit for the quantity.");
    if (a !== null && !(a >= 0)) return setError("Price must be a number of rupees.");
    if (a !== null && !(per > 0)) return setError("The price must be for an amount above 0.");
    if (a !== null && !perUnit) return setError("Choose what the price is for (per kg, per piece…).");
    onSubmit(
      name.trim(),
      q === null ? null : { value: q, unit: qtyUnit || null },
      a === null ? null : { amount: a, forValue: per, unit: perUnit || null },
    );
  };

  const unitSelect = (value: Unit | "", set: (u: Unit | "") => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => set(e.target.value as Unit | "")} className={field}>
      <option value="">Unit…</option>
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {unitLabel(u)}
        </option>
      ))}
    </select>
  );

  return (
    <form onSubmit={submit} className="mt-2 space-y-2.5 rounded-xl border border-line bg-canvas/40 p-3">
      {!item && (
        <label className="block text-xs font-semibold text-muted">
          Product
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Tomato" className={`${field} mt-1`} />
        </label>
      )}
      <fieldset>
        <legend className="text-xs font-semibold text-muted">Quantity</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" aria-label="Quantity" placeholder="e.g. 2" className={field} />
          {unitSelect(qtyUnit, setQtyUnit, "Quantity unit")}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-xs font-semibold text-muted">Vendor&apos;s price (₹ for an amount)</legend>
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Price in rupees" placeholder="₹" className={field} />
          <span className="text-xs text-muted">for</span>
          <input value={perQty} onChange={(e) => setPerQty(e.target.value)} inputMode="decimal" aria-label="Price is for this amount" className={field} />
          {unitSelect(perUnit, setPerUnit, "Price unit")}
        </div>
        <p className="mt-1 text-[0.7rem] text-muted">Leave the price empty if the vendor has not said it.</p>
      </fieldset>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={smallButton + " border-accent text-accent"}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={smallButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------- One cart line ----------

function ItemLine({ item }: { item: CartItem }) {
  const total = itemTotalPaise(item);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold break-words first-letter:uppercase">
          {item.name}
          {item.variant && <span className="font-normal text-muted"> ({item.variant})</span>}
        </p>
        <p className="text-sm">
          <span className={item.quantity ? "" : "text-warn"}>{item.quantity ? formatQuantity(item.quantity) : "Quantity missing"}</span>
          <span className="text-muted"> × </span>
          <span className={item.price ? "" : "text-warn"}>{item.price ? formatPrice(item.price) : "Price unavailable"}</span>
          {item.priceCorrected && <span className="ml-1.5 text-xs text-vendor">corrected</span>}
        </p>
      </div>
      <p className="shrink-0 font-display font-bold tabular-nums">{total === null ? <span className="text-muted">—</span> : formatPaise(total)}</p>
    </div>
  );
}

function CartRow({ item, cart }: { item: CartItem; cart: CartController }) {
  const [editing, setEditing] = useState(false);
  const problems = itemProblems(item).filter((p) => p !== "question");
  const heard = lastHeard(item);
  const q = item.question;

  return (
    <li className="py-3">
      <ItemLine item={item} />

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {item.confirmation === "confirmed" && problems.length === 0 && !q && (
          <span className="flex items-center gap-1 rounded-md bg-live-soft px-1.5 py-0.5 text-[0.7rem] font-bold text-live">
            <CheckIcon className="size-3" /> Checked
          </span>
        )}
        {problems.map((p) => (
          <span key={p} className="rounded-md bg-warn-soft px-1.5 py-0.5 text-[0.7rem] font-bold text-warn">
            {PROBLEM_TEXT[p]}
          </span>
        ))}
      </div>
      {item.notes.length > 0 && <p className="mt-1 text-xs text-warn">{item.notes.join(". ")}</p>}

      {q && (
        <div role="group" aria-label={`Question about ${item.name}`} className="mt-2 rounded-xl border border-warn/40 bg-warn-soft p-2.5 text-sm">
          {q.kind === "add_or_replace" ? (
            <>
              <p className="text-warn">
                The customer said {formatQuantity(q.quantity)} again. Is that extra, or a change from{" "}
                {item.quantity ? formatQuantity(item.quantity) : "before"}?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.quantity && addQuantities(item.quantity, q.quantity) && (
                  <button type="button" onClick={() => cart.answer(item.id, "add")} className={smallButton}>
                    Add, total {formatQuantity(addQuantities(item.quantity, q.quantity)!)}
                  </button>
                )}
                <button type="button" onClick={() => cart.answer(item.id, "replace")} className={smallButton}>
                  Change to {formatQuantity(q.quantity)}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-warn">Did the customer mean to remove this item?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => cart.answer(item.id, "remove")} className={smallButton}>
                  Remove it
                </button>
                <button type="button" onClick={() => cart.answer(item.id, "keep")} className={smallButton}>
                  Keep it
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {heard && (
        <p className="mt-1 text-xs text-muted">
          <span className={heard.speaker === "customer" ? "text-customer" : "text-vendor"}>
            {heard.speaker === "customer" ? "Customer" : "Vendor"}
          </span>{" "}
          said “{heard.quote}”
        </p>
      )}

      {editing ? (
        <ItemForm
          item={item}
          submitLabel="Save"
          onSubmit={(_, quantity, price) => {
            cart.edit(item.id, quantity, price);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setEditing(true)} className={smallButton}>
            Edit quantity / price
          </button>
          {item.confirmation === "needs_review" && !q && (
            <button type="button" onClick={() => cart.markChecked(item.id)} className={smallButton}>
              Looks right
            </button>
          )}
          <button type="button" onClick={() => cart.remove(item.id)} className={smallButton + " text-danger"}>
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

// ---------- Panel ----------

function TotalBar({ count, total, withProblems }: { count: number; total: number | null; withProblems: number }) {
  return (
    <div className="mt-1 flex items-end justify-between gap-3 border-t border-line pt-3">
      <p className="text-sm text-muted">
        {count} {count === 1 ? "item" : "items"}
      </p>
      <div className="text-right">
        <p className="text-xs text-muted">Grand total</p>
        {total === null ? (
          <p className="text-sm font-semibold text-warn">
            Not available{withProblems > 0 && ` · ${withProblems} ${withProblems === 1 ? "item needs" : "items need"} attention`}
          </p>
        ) : (
          <p className="font-display text-xl font-extrabold tabular-nums">{formatPaise(total)}</p>
        )}
      </div>
    </div>
  );
}

export function CartPanel({
  cart,
  demoActive,
  updating,
  extractionError,
}: {
  cart: CartController;
  demoActive: boolean;
  /** The conversation is being read. */
  updating: boolean;
  extractionError?: string;
}) {
  const [adding, setAdding] = useState(false);
  const { items, status } = cart.cart;
  const { count, withProblems, grandTotalPaise } = cartSummary(cart.cart);
  const reviewing = status === "reviewing" && count > 0;

  return (
    <section aria-label="Shopping cart" className="rounded-3xl border border-line bg-surface p-4 shadow-xl shadow-black/25">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            {reviewing ? "Review purchase" : "Shopping cart"}
            {count > 0 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.7rem] text-accent">{count}</span>}
            {updating && !demoActive && <Spinner className="size-3.5 text-muted" />}
          </h2>
          <p className="text-xs text-muted">
            {reviewing
              ? "Check every quantity and price with the vendor before confirming."
              : "Built from what the customer asks for and the vendor's prices."}
          </p>
        </div>
        <a href="#purchase-history" className={smallButton + " inline-flex items-center"}>
          Purchase history
        </a>
      </div>

      {cart.saved && (
        <p role="status" className="mt-3 rounded-xl bg-live-soft px-3 py-2 text-xs text-live">
          <strong>Purchase saved</strong> to this device&apos;s history: {cart.saved.items.length}{" "}
          {cart.saved.items.length === 1 ? "item" : "items"}, {formatPaise(cart.saved.grandTotalPaise)}. No payment was
          made or recorded by VoxMandi AI.
        </p>
      )}

      {demoActive ? (
        <p className="mt-3 text-xs text-muted">The cart is only built from live conversations, not the demo sample.</p>
      ) : reviewing ? (
        <>
          <ul className="mt-3 divide-y divide-line">
            {items.map((item) => {
              const problems = itemProblems(item);
              return (
                <li key={item.id} className="py-2.5">
                  <ItemLine item={item} />
                  {problems.length > 0 && (
                    <p className="mt-1 text-xs font-semibold text-warn">{problems.map((p) => PROBLEM_TEXT[p]).join(" · ")}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <TotalBar count={count} total={grandTotalPaise} withProblems={withProblems} />
          <p className="mt-3 text-[0.7rem] text-muted">
            Confirming saves this purchase in this browser&apos;s history. It does not pay the vendor: VoxMandi AI never
            takes or records payment.
          </p>
          {grandTotalPaise === null && (
            <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
              Fix the items marked above before confirming. Go back to the cart to edit or remove them.
            </p>
          )}
          {cart.saveError && (
            <p role="alert" className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
              {cart.saveError}
            </p>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={cart.back} className={smallButton + " min-h-11"}>
              Back to cart
            </button>
            <button type="button" onClick={cart.confirmPurchase} disabled={grandTotalPaise === null} className={primaryButton}>
              Confirm purchase
            </button>
          </div>
        </>
      ) : (
        <>
          {extractionError && (
            <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
              The conversation could not be read for the cart ({extractionError}). You can still add items by hand.
            </p>
          )}
          {count === 0 ? (
            !adding && (
              <p className="mt-3 text-sm text-muted">
                Your cart is empty. Items the customer asks for will appear here with the vendor&apos;s prices.
              </p>
            )
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {items.map((item) => (
                <CartRow key={item.id} item={item} cart={cart} />
              ))}
            </ul>
          )}

          {adding && (
            <ItemForm
              submitLabel="Add to cart"
              onSubmit={(name, quantity, price) => {
                cart.addManual(name, quantity, price);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          )}

          {count > 0 && <TotalBar count={count} total={grandTotalPaise} withProblems={withProblems} />}

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {!adding && (
              <button type="button" onClick={() => setAdding(true)} className={smallButton + " min-h-11"}>
                Add item by hand
              </button>
            )}
            {count > 0 && (
              <button type="button" onClick={cart.review} className={primaryButton}>
                Review cart
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
