"use client";

import { useCart } from "@/hooks/use-cart";
import { useMarketNotes } from "@/hooks/use-market-notes";
import type { Turn } from "@/lib/types/conversation";
import { CartPanel } from "./cart-panel";
import { SummaryPanel } from "./summary-panel";

/**
 * Per-conversation state: the shopping cart and market notes. Both come from the
 * same /api/summary request. The parent remounts this (via `key`) on every clear.
 */
export function MarketSession({ turns, demoActive, busy }: { turns: Turn[]; demoActive: boolean; busy: boolean }) {
  const cart = useCart();
  const notes = useMarketNotes(turns, demoActive, busy, cart.applyExtraction);

  return (
    <>
      <CartPanel
        cart={cart}
        demoActive={demoActive}
        updating={notes.state.status === "loading"}
        extractionError={notes.state.status === "error" ? notes.state.error.message : undefined}
      />
      <SummaryPanel
        state={notes.state}
        items={notes.items}
        usableCount={notes.usableCount}
        demoActive={demoActive}
        busy={busy}
        onRefresh={notes.refresh}
      />
    </>
  );
}
