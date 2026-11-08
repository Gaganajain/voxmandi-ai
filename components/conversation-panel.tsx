"use client";

import { useEffect, useRef } from "react";
import type { Playback } from "@/hooks/use-conversation";
import type { Turn } from "@/lib/types/conversation";
import { ConversationMessage } from "./conversation-message";
import { MicIcon } from "./icons";

export function ConversationPanel({
  turns,
  playback,
  playbackError,
  retryDisabled,
  recording,
  demoActive,
  missing,
  onToggleAudio,
  onRetry,
  onClear,
  onShowDemo,
  onExitDemo,
}: {
  turns: Turn[];
  playback: Playback | null;
  playbackError: { id: string; message: string } | null;
  retryDisabled: boolean;
  /** A microphone is active; Clear then discards the recording. */
  recording: boolean;
  demoActive: boolean;
  /** Env vars still unset, shown when the app cannot run live. */
  missing: string[];
  onToggleAudio: (turn: Turn) => void;
  onRetry: (turn: Turn) => void;
  onClear: () => void;
  onShowDemo: () => void;
  onExitDemo: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const lastTurn = turns.at(-1);

  useEffect(() => {
    if (turns.length) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length, lastTurn?.transcript, lastTurn?.translation, lastTurn?.error, lastTurn?.audioUrl]);

  const smallButton =
    "min-h-10 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-text hover:bg-raised disabled:opacity-40 sm:min-h-0";

  return (
    <section
      aria-label="Conversation"
      className="flex min-h-[18rem] flex-col rounded-3xl border border-line bg-surface shadow-xl shadow-black/25 lg:h-[min(60vh,40rem)] lg:min-h-0 lg:overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="font-display text-sm font-bold">
          Conversation
          {demoActive && <span className="ml-2 rounded-md bg-warn-soft px-1.5 py-0.5 text-[0.65rem] text-warn max-[359px]:hidden">DEMO</span>}
        </h2>
        <div className="flex gap-1.5">
          {demoActive ? (
            <button type="button" onClick={onExitDemo} className={smallButton}>
              Exit demo
            </button>
          ) : (
            <button type="button" onClick={onShowDemo} className={smallButton}>
              View demo
            </button>
          )}
          <button type="button" onClick={onClear} disabled={turns.length === 0 && !demoActive && !recording} className={smallButton}>
            Clear
          </button>
        </div>
      </div>

      {demoActive && (
        <p className="border-b border-line bg-warn-soft px-4 py-2.5 text-xs text-warn">
          <strong>DEMO:</strong> a sample conversation written by hand. It did not come from a microphone, Groq or
          Gnani, and has no audio. Exit demo to use the microphones.
        </p>
      )}
      {!demoActive && missing.length > 0 && (
        <p className="border-b border-line bg-danger-soft px-4 py-2.5 text-xs text-danger">
          <strong>Configuration required.</strong> Add {missing.join(" and ")} to .env.local, or to the Environment Variables of your hosting project (e.g. Vercel), for live voice. Recording
          still works, but it stops at the first service without a key.
        </p>
      )}

      <div className="flex-1 p-3 sm:p-4 lg:min-h-0 lg:overflow-y-auto">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-2 py-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
              <MicIcon className="size-5" />
            </span>
            <p className="mt-3 font-display text-lg font-bold">Start your conversation</p>
            <p className="mt-1 text-sm text-muted">Tap the customer or vendor microphone to speak.</p>
            <ol className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
              {["Tap the microphone", "Speak naturally", "Hear the translation"].map((step, i) => (
                <li key={step} className="flex items-center gap-1.5">
                  <span className="flex size-4 items-center justify-center rounded-full bg-raised text-[0.65rem] font-bold text-accent">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <ul className="space-y-4" aria-live="polite">
            {turns.map((turn) => (
              <ConversationMessage
                key={turn.id}
                turn={turn}
                playback={playback?.id === turn.id ? playback.status : null}
                playbackError={playbackError?.id === turn.id ? playbackError.message : undefined}
                retryDisabled={retryDisabled}
                onToggleAudio={() => onToggleAudio(turn)}
                onRetry={() => onRetry(turn)}
              />
            ))}
          </ul>
        )}
        <div ref={end} className="scroll-mb-64 lg:scroll-mb-0" />
      </div>
    </section>
  );
}
