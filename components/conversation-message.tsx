import type { Playback } from "@/hooks/use-conversation";
import { getLanguage } from "@/lib/languages";
import type { Turn } from "@/lib/types/conversation";
import { AudioPlayer } from "./audio-player";
import { CheckIcon, Spinner } from "./icons";

type Step = "upload" | "stt" | "translate" | "tts";

function StageProgress({ turn }: { turn: Turn }) {
  const source = getLanguage(turn.source).name;
  const target = getLanguage(turn.target).name;
  const steps: { id: Step; label: string }[] = [
    { id: "upload", label: "Uploading" },
    { id: "stt", label: `Hearing ${source}` },
    { id: "translate", label: `Translating to ${target}` },
    { id: "tts", label: `${target} voice` },
  ];
  const current = steps.findIndex((s) => s.id === (turn.stage ?? "upload"));
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs" role="status" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={s.id}
            aria-current={active ? "step" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
              active ? "bg-accent-soft text-accent" : done ? "text-live" : "text-muted/60"
            }`}
          >
            {done ? <CheckIcon className="size-3.5" /> : active ? <Spinner className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
            {s.label}
            {active && "…"}
          </li>
        );
      })}
    </ol>
  );
}

export function ConversationMessage({
  turn,
  playback,
  playbackError,
  retryDisabled,
  onToggleAudio,
  onRetry,
}: {
  turn: Turn;
  playback: Playback["status"] | null;
  playbackError?: string;
  retryDisabled: boolean;
  onToggleAudio: () => void;
  onRetry: () => void;
}) {
  const isCustomer = turn.role === "customer";
  const source = getLanguage(turn.source);
  const target = getLanguage(turn.target);
  const speaker = isCustomer ? "Customer" : "Vendor";

  return (
    <li className={`flex scroll-mb-64 lg:scroll-mb-4 ${isCustomer ? "justify-start" : "justify-end"}`}>
      <article
        aria-label={`${speaker} message`}
        className={`w-full max-w-[36rem] overflow-hidden rounded-3xl border bg-raised shadow-lg shadow-black/20 sm:w-[88%] ${
          isCustomer ? "rounded-tl-md border-customer/25" : "rounded-tr-md border-vendor/25"
        }`}
      >
        <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 pt-3">
          <span className={`flex items-center gap-2 text-xs font-bold tracking-wide uppercase ${isCustomer ? "text-customer" : "text-vendor"}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${isCustomer ? "bg-customer" : "bg-vendor"}`} />
            {speaker} · {source.name}
            {turn.demo && (
              <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-[0.65rem] font-bold tracking-normal whitespace-nowrap text-warn normal-case">
                DEMO sample
              </span>
            )}
          </span>
          <span className="text-xs whitespace-nowrap text-muted">
            {source.name} → {target.name}
          </span>
        </header>

        <div className="space-y-3 px-4 pt-2 pb-4">
          {turn.transcript && (
            <div lang={turn.source}>
              <p className="sr-only" lang="en">Said in {source.name}:</p>
              <p className="text-base text-text/90">{turn.transcript}</p>
            </div>
          )}
          {turn.translation && (
            <div lang={turn.target} className={`rounded-2xl px-3.5 py-3 ${isCustomer ? "bg-customer-soft" : "bg-vendor-soft"}`}>
              <p className={`text-[0.7rem] font-semibold tracking-wide uppercase ${isCustomer ? "text-customer" : "text-vendor"}`} lang="en">
                {target.name} translation
              </p>
              <p className="mt-0.5 text-xl leading-snug font-bold">{turn.translation}</p>
            </div>
          )}

          {turn.status === "processing" && <StageProgress turn={turn} />}

          {turn.error && (
            <div role="alert" className="rounded-2xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
              {turn.error.stage === "tts" && (
                <p className="font-semibold">The {target.name} audio could not be generated. The translation above is complete.</p>
              )}
              {turn.error.stage === "translate" && turn.transcript && (
                <p className="font-semibold">Translation failed. The {source.name} transcript is kept above.</p>
              )}
              <p>{turn.error.message}</p>
              {turn.error.retryable && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={retryDisabled}
                  className="mt-2 min-h-10 rounded-lg border border-danger/40 px-4 py-1 text-sm font-semibold sm:min-h-0 sm:px-3 sm:text-xs hover:bg-danger/10 disabled:opacity-50"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {turn.audioUrl && (
            <AudioPlayer status={playback} languageName={target.name} error={playbackError} onToggle={onToggleAudio} />
          )}
        </div>
      </article>
    </li>
  );
}
