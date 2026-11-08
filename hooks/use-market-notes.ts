"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicError, SummaryItem, SummaryResponse, Turn } from "@/lib/types/conversation";

export type NotesState =
  | { status: "idle" }
  | { status: "loading"; previous?: SummaryItem[] }
  | { status: "done"; items: SummaryItem[]; signature: string }
  | { status: "error"; error: PublicError };

/** Completed live turns; their signature changes whenever one is added or finishes. */
function usableTurns(turns: Turn[]) {
  return turns.filter((t) => t.transcript && !t.demo && t.status !== "processing");
}
const signatureOf = (turns: Turn[]) => turns.map((t) => `${t.id}:${t.translation ?? ""}`).join("|");

/**
 * Market notes: products, quantities and prices actually said, extracted
 * server-side by one /api/summary request after each finished message. The same
 * response also feeds the shopping cart through `onResult`, so the cart costs no
 * extra AI request. The caller remounts it (via `key`) whenever the conversation is cleared.
 */
export function useMarketNotes(
  turns: Turn[],
  demoActive: boolean,
  busy: boolean,
  onResult: (forTurns: Turn[], items: SummaryItem[]) => void,
) {
  const [state, setState] = useState<NotesState>({ status: "idle" });
  const usable = usableTurns(turns);
  const signature = signatureOf(usable);
  const latest = useRef(signature);
  const usableRef = useRef(usable);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    latest.current = signature;
    usableRef.current = usable;
    onResultRef.current = onResult;
  });

  const run = useCallback(async (forTurns: Turn[], forSignature: string) => {
    setState((s) => ({ status: "loading", previous: s.status === "done" ? s.items : s.status === "loading" ? s.previous : undefined }));
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turns: forTurns.map(({ role, source, target, transcript, translation }) => ({ role, source, target, transcript, translation })),
        }),
      });
      const body: SummaryResponse | null = await res.json().catch(() => null);
      if (latest.current !== forSignature) return; // conversation moved on; a newer run is coming
      if (body && "items" in body) {
        setState({ status: "done", items: body.items, signature: forSignature });
        onResultRef.current(forTurns, body.items);
      } else
        setState({
          status: "error",
          error: body?.error ?? { code: "INVALID_RESPONSE", message: "Market notes could not be loaded.", retryable: true },
        });
    } catch {
      if (latest.current === forSignature)
        setState({ status: "error", error: { code: "NETWORK", message: "Could not reach the server.", retryable: true } });
    }
  }, []);

  // Refresh automatically once a message finishes and nothing is in flight.
  const lastRun = useRef("");
  useEffect(() => {
    if (demoActive || busy || !signature || lastRun.current === signature) return;
    const timer = setTimeout(() => {
      lastRun.current = signature;
      void run(usableRef.current, signature);
    }, 600);
    return () => clearTimeout(timer);
  }, [signature, busy, demoActive, run]);

  const items = state.status === "done" ? state.items : state.status === "loading" ? state.previous : undefined;

  return {
    state,
    items,
    usableCount: usable.length,
    refresh: () => void run(usable, signature),
  };
}
