"use client";

import { useCallback, useReducer, useState, useSyncExternalStore } from "react";
import { buildPurchase, cartReducer, createCart, type CartCommand } from "@/lib/cart/cart";
import {
  deletePurchase,
  readPurchases,
  savePurchase,
  serverPurchases,
  subscribePurchases,
} from "@/lib/cart/purchase-storage";
import type { Purchase, Quantity, UnitPrice } from "@/lib/types/cart";
import type { SummaryItem, Turn } from "@/lib/types/conversation";

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
const now = () => new Date().toISOString();

/**
 * The active cart for this conversation. It lives in memory only (like the
 * conversation itself) and is separate from saved purchase history.
 */
export function useCart() {
  const [cart, dispatch] = useReducer(cartReducer, undefined, () => createCart(crypto.randomUUID(), now()));
  const [saved, setSaved] = useState<Purchase | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const send = useCallback((command: Without<CartCommand, "at">) => {
    setSaved(null);
    setSaveError(null);
    dispatch({ ...command, at: now() } as CartCommand);
  }, []);

  /** Applies one /api/summary result. Each turn is only applied the first time it appears. */
  const applyExtraction = useCallback((forTurns: Turn[], items: SummaryItem[]) => {
    dispatch({
      type: "apply_turns",
      at: now(),
      turns: forTurns.map((t, i) => ({ id: t.id, role: t.role, items: items.filter((item) => item.turn === i + 1) })),
    });
  }, []);

  /** Saves the cart as a confirmed purchase. Only ever called from the explicit Confirm button. */
  const confirmPurchase = () => {
    const purchase = buildPurchase(cart, crypto.randomUUID(), now());
    if (!purchase) {
      setSaveError("Some items are incomplete, so the purchase cannot be confirmed yet.");
      return;
    }
    const result = savePurchase(purchase);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    dispatch({ type: "new_cart", id: crypto.randomUUID(), at: now() });
    setSaved(purchase);
    setSaveError(null);
  };

  return {
    cart,
    saved,
    saveError,
    applyExtraction,
    confirmPurchase,
    edit: (id: string, quantity: Quantity | null, price: UnitPrice | null) => send({ type: "edit", id, quantity, price }),
    remove: (id: string) => send({ type: "remove", id }),
    markChecked: (id: string) => send({ type: "mark_checked", id }),
    answer: (id: string, choice: "add" | "replace" | "remove" | "keep") => send({ type: "answer", id, choice }),
    addManual: (name: string, quantity: Quantity | null, price: UnitPrice | null) =>
      send({ type: "add_manual", id: crypto.randomUUID(), name, quantity, price }),
    review: () => send({ type: "review" }),
    back: () => send({ type: "back" }),
  };
}

export type CartController = ReturnType<typeof useCart>;

/** Saved purchases from this browser's storage; "loading" during server render. */
export function usePurchases() {
  const store = useSyncExternalStore(subscribePurchases, readPurchases, serverPurchases);
  return { store, remove: deletePurchase };
}
