/**
 * Confirmed purchases, kept in this browser's localStorage. This is not cloud
 * storage: history stays on this device and is lost if site data is cleared.
 * The active cart is never stored here; only purchases the customer confirmed.
 */
import { z } from "zod";
import { itemTotalPaise, UNITS } from "@/lib/cart/cart";
import type { Purchase, Unit } from "@/lib/types/cart";

const KEY = "voxmandi.purchases.v1";
const CHANGE_EVENT = "voxmandi:purchases-changed";

const unit = z.enum(UNITS as [Unit, ...Unit[]]);
const purchaseSchema = z
  .object({
    id: z.string().min(1),
    cartId: z.string().min(1),
    status: z.literal("confirmed"),
    createdAt: z.iso.datetime(),
    confirmedAt: z.iso.datetime(),
    grandTotalPaise: z.number().int().nonnegative(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1).max(80),
          variant: z.string().max(60).nullable(),
          quantity: z.object({ value: z.number().positive(), unit }),
          price: z.object({ amount: z.number().nonnegative(), forValue: z.number().positive(), unit }),
          totalPaise: z.number().int().nonnegative(),
        }),
      )
      .min(1),
  })
  // A record whose sums do not add up is shown as unreadable rather than with a wrong total.
  .refine(
    (p) =>
      p.items.every((i) => itemTotalPaise(i) === i.totalPaise) &&
      p.items.reduce((s, i) => s + i.totalPaise, 0) === p.grandTotalPaise,
  );

export type PurchaseStore =
  | { status: "loading" }
  | { status: "unavailable" }
  /** `unreadable`: saved records that are malformed; they are kept, not shown. */
  | { status: "ready"; purchases: Purchase[]; unreadable: number };

const LOADING: PurchaseStore = { status: "loading" };
const UNAVAILABLE: PurchaseStore = { status: "unavailable" };

function parse(raw: string | null): PurchaseStore {
  if (!raw) return { status: "ready", purchases: [], unreadable: 0 };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: "ready", purchases: [], unreadable: 1 };
  }
  if (!Array.isArray(data)) return { status: "ready", purchases: [], unreadable: 1 };
  const purchases: Purchase[] = [];
  let unreadable = 0;
  for (const entry of data) {
    const parsed = purchaseSchema.safeParse(entry);
    if (parsed.success) purchases.push(parsed.data);
    else unreadable++;
  }
  purchases.sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
  return { status: "ready", purchases, unreadable };
}

// useSyncExternalStore needs the same object back while the data is unchanged.
let cache: { raw: string | null; value: PurchaseStore } | undefined;

export function readPurchases(): PurchaseStore {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return UNAVAILABLE; // blocked storage, private mode restrictions, etc.
  }
  if (cache?.raw !== raw || !cache) cache = { raw, value: parse(raw) };
  return cache.value;
}

export const serverPurchases = () => LOADING;

export function subscribePurchases(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export type StorageResult = { ok: true } | { ok: false; message: string };

/** Applies a change to the stored list. Unreadable entries are left as they are. */
function write(change: (entries: unknown[]) => unknown[]): StorageResult {
  try {
    const storage = window.localStorage;
    const raw = storage.getItem(KEY);
    let entries: unknown[] = [];
    if (raw) {
      try {
        const data: unknown = JSON.parse(raw);
        if (Array.isArray(data)) entries = data;
        else throw new Error("not a list");
      } catch {
        // Keep a copy of whatever was there instead of overwriting it.
        storage.setItem(`${KEY}.backup-${Date.now()}`, raw);
      }
    }
    storage.setItem(KEY, JSON.stringify(change(entries)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return { ok: true };
  } catch (err) {
    const full = err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
    return {
      ok: false,
      message: full
        ? "This browser's storage is full, so the purchase was not saved."
        : "This browser does not allow saving here (storage may be blocked or in private mode), so the purchase was not saved.",
    };
  }
}

export function savePurchase(purchase: Purchase): StorageResult {
  if (!purchaseSchema.safeParse(purchase).success) {
    return { ok: false, message: "This purchase is incomplete, so it was not saved." };
  }
  return write((entries) => [...entries, purchase]);
}

export function deletePurchase(id: string): StorageResult {
  return write((entries) =>
    entries.filter((e) => !(e && typeof e === "object" && "id" in e && (e as { id: unknown }).id === id)),
  );
}
