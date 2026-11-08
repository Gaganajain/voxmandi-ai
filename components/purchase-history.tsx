"use client";

import { useState } from "react";
import { usePurchases } from "@/hooks/use-cart";
import { formatPaise, formatPrice, formatQuantity } from "@/lib/cart/cart";
import type { Purchase } from "@/lib/types/cart";

const smallButton =
  "min-h-10 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-text hover:bg-raised disabled:opacity-40 sm:min-h-0";
const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

function PurchaseDetails({ purchase, onDelete }: { purchase: Purchase; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mt-2 rounded-xl border border-line bg-canvas/40 p-3">
      <ul className="divide-y divide-line">
        {purchase.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-semibold break-words first-letter:uppercase">
                {item.name}
                {item.variant && <span className="font-normal text-muted"> ({item.variant})</span>}
              </p>
              <p className="text-sm text-muted">
                {formatQuantity(item.quantity)} × {formatPrice(item.price)}
              </p>
            </div>
            <p className="shrink-0 font-bold tabular-nums">{formatPaise(item.totalPaise)}</p>
          </li>
        ))}
      </ul>
      <div className="flex items-end justify-between gap-3 border-t border-line pt-2.5">
        <p className="text-xs text-muted">Confirmed by the customer. No payment recorded.</p>
        <p className="shrink-0 font-display text-lg font-extrabold tabular-nums">{formatPaise(purchase.grandTotalPaise)}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap justify-end gap-2">
        {confirming ? (
          <>
            <span className="self-center text-xs text-danger">Delete this purchase from this device?</span>
            <button type="button" onClick={onDelete} className={smallButton + " border-danger/60 text-danger"}>
              Yes, delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={smallButton}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={smallButton + " text-danger"}>
            Delete purchase
          </button>
        )}
      </div>
    </div>
  );
}

/** Confirmed purchases saved in this browser. Real records only; there is no sample data. */
export function PurchaseHistory() {
  const { store, remove } = usePurchases();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      id="purchase-history"
      aria-label="Purchase history"
      className="scroll-mt-20 rounded-3xl border border-line bg-surface p-4 shadow-xl shadow-black/25"
    >
      <h2 className="font-display text-sm font-bold">Purchase history</h2>
      <p className="text-xs text-muted">
        Saved in this browser on this device only. It is not backed up, and clearing browser data deletes it.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {store.status === "loading" ? (
        <p className="mt-3 text-sm text-muted">Loading saved purchases…</p>
      ) : store.status === "unavailable" ? (
        <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
          This browser does not allow local storage here, so purchases cannot be saved or shown.
        </p>
      ) : (
        <>
          {store.unreadable > 0 && (
            <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
              {store.unreadable} saved {store.unreadable === 1 ? "record" : "records"} could not be read and{" "}
              {store.unreadable === 1 ? "is" : "are"} not shown.
            </p>
          )}
          {store.purchases.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No purchases yet. Purchases you confirm in the cart will appear here.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {store.purchases.map((p) => {
                const open = openId === p.id;
                return (
                  <li key={p.id} className="py-2">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : p.id)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-1 text-left hover:bg-raised"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{dateTime.format(new Date(p.confirmedAt))}</span>
                        <span className="block text-xs text-muted">
                          {p.items.length} {p.items.length === 1 ? "item" : "items"} · {open ? "Hide" : "Open"} details
                        </span>
                      </span>
                      <span className="shrink-0 font-display font-bold tabular-nums">{formatPaise(p.grandTotalPaise)}</span>
                    </button>
                    {open && (
                      <PurchaseDetails
                        purchase={p}
                        onDelete={() => {
                          const result = remove(p.id);
                          setError(result.ok ? null : result.message);
                          if (result.ok) setOpenId(null);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
