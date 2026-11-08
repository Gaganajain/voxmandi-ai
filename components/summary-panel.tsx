"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicError, SummaryItem, SummaryResponse, Turn } from "@/lib/types/conversation";
import { Spinner } from "./icons";

type State =
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
 * Products, quantities and prices actually said, extracted server-side and
 * checked against the conversation text. Refreshes after each finished message.
 * The parent remounts it (via `key`) whenever the conversation is cleared.
 */
export function SummaryPanel({ turns, demoActive, busy }: { turns: Turn[]; demoActive: boolean; busy: boolean }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const usable = usableTurns(turns);
  const signature = signatureOf(usable);
  const latest = useRef(signature);
  const usableRef = useRef(usable);
  useEffect(() => {
    latest.current = signature;
    usableRef.current = usable;
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
      if (body && "items" in body) setState({ status: "done", items: body.items, signature: forSignature });
      else
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

  return (
    <section aria-label="Market notes" className="rounded-3xl border border-line bg-surface p-4 shadow-xl shadow-black/25">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            Market notes {state.status === "loading" && <Spinner className="size-3.5 text-muted" />}
          </h2>
          <p className="text-xs text-muted">Products, quantities and prices mentioned in this conversation.</p>
        </div>
        {!demoActive && usable.length > 0 && (
          <button
            type="button"
            onClick={() => void run(usable, signature)}
            disabled={state.status === "loading" || busy}
            className="min-h-10 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-raised disabled:opacity-40 sm:min-h-0"
          >
            Refresh notes
          </button>
        )}
      </div>

      {demoActive ? (
        <p className="mt-3 text-xs text-muted">Notes are only made from live conversations, not the demo sample.</p>
      ) : usable.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Market notes will appear after your conversation begins.</p>
      ) : state.status === "error" ? (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          {state.error.message}
        </p>
      ) : !items ? (
        <p className="mt-3 text-sm text-muted">Reading the conversation…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No products, quantities or prices have been mentioned yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((item, i) => (
            <li key={i} className="py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="font-semibold first-letter:uppercase">{item.product}</span>
                {item.uncertain && (
                  <span className="rounded-md bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">Uncertain</span>
                )}
              </div>
              <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                <div className="flex gap-1.5">
                  <dt className="text-muted">Quantity:</dt>
                  <dd className="font-medium">{item.quantity ?? "not stated"}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted">Price mentioned:</dt>
                  <dd className="font-medium">{item.price ?? "not stated"}</dd>
                </div>
              </dl>
              <p className="mt-1 text-xs text-muted">
                <span className={item.speaker === "customer" ? "text-customer" : "text-vendor"}>
                  {item.speaker === "customer" ? "Customer" : "Vendor"}
                </span>{" "}
                said “{item.quote}”
              </p>
              {item.note && <p className="mt-0.5 text-xs text-warn">{item.note}</p>}
            </li>
          ))}
        </ul>
      )}
      {!demoActive && items && items.length > 0 && (
        <p className="mt-2 border-t border-line pt-2.5 text-[0.7rem] text-muted">
          Extracted by AI from the conversation text and checked against it. This is not a bill and does not mean
          anything was bought. Confirm prices with the vendor.
        </p>
      )}
    </section>
  );
}
