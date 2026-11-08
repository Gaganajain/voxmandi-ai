import { MAX_RECORDING_SECONDS, type RecorderPhase } from "@/hooks/use-recorder";
import { getLanguage, type LanguageCode } from "@/lib/languages";
import type { Role, Turn } from "@/lib/types/conversation";
import { CheckIcon, MicIcon, Spinner, StopIcon } from "./icons";

const ROLE_STYLES: Record<Role, { title: string; button: string; text: string; ring: string; pulse: string }> = {
  customer: {
    title: "Customer",
    button: "bg-customer text-on-accent",
    text: "text-customer",
    ring: "lg:border-customer/25",
    pulse: "#b9a6ff",
  },
  vendor: {
    title: "Vendor",
    button: "bg-vendor text-on-vendor",
    text: "text-vendor",
    ring: "lg:border-vendor/25",
    pulse: "#f5b860",
  },
};

function formatTime(seconds: number) {
  return `0:${String(seconds).padStart(2, "0")}`;
}

/** Describes exactly where this speaker's recording is in the real pipeline. */
function describe(phase: RecorderPhase, seconds: number, language: string, active?: Turn, last?: Turn) {
  switch (phase) {
    case "starting":
      return { text: "Starting microphone…", tone: "muted" as const };
    case "recording":
      return { text: `Listening · speak ${language} · ${formatTime(seconds)} / ${formatTime(MAX_RECORDING_SECONDS)}`, tone: "role" as const };
    case "stopping":
      return { text: "Stopping recording…", tone: "muted" as const };
    case "converting":
      return { text: "Preparing audio…", tone: "muted" as const };
  }
  if (active) {
    const target = getLanguage(active.target).name;
    const text = !active.stage
      ? "Uploading audio…"
      : active.stage === "stt"
        ? `Recognising ${language}…`
        : active.stage === "translate"
          ? `Translating to ${target}…`
          : `Creating ${target} voice…`;
    return { text, tone: "muted" as const };
  }
  if (last?.status === "done") return { text: `Translated · tap to speak again`, tone: "done" as const };
  if (last?.status === "error") return { text: "Didn't go through · see the message", tone: "error" as const };
  return { text: `Tap to speak ${language}`, tone: "muted" as const };
}

/**
 * One speaker's microphone. On phones it sits in the bottom dock (compact);
 * on desktop it becomes a full side panel.
 */
export function MicrophonePanel({
  role,
  language,
  phase,
  seconds,
  activeTurn,
  lastTurn,
  isTurn,
  disabled,
  error,
  onStart,
  onStop,
}: {
  /** This speaker is expected to talk next; the other mic still works. */
  isTurn: boolean;
  role: Role;
  language: LanguageCode;
  /** This side's recorder phase; "idle" while the other side is active. */
  phase: RecorderPhase;
  seconds: number;
  /** This side's message currently in the pipeline. */
  activeTurn?: Turn;
  /** This side's most recent message. */
  lastTurn?: Turn;
  disabled: boolean;
  error?: string;
  onStart: () => void;
  onStop: () => void;
}) {
  const style = ROLE_STYLES[role];
  const lang = getLanguage(language);
  const recording = phase === "recording";
  const working = Boolean(activeTurn) || phase === "converting" || phase === "starting" || phase === "stopping";
  const status = describe(phase, seconds, lang.name, activeTurn, lastTurn);
  const toneClass = { muted: "text-muted", role: style.text, done: "text-live", error: "text-danger" }[status.tone];
  const showTurn = isTurn && phase === "idle" && !activeTurn && !disabled;

  return (
    <section
      aria-label={`${style.title} microphone`}
      className={`flex min-w-0 flex-col items-center gap-1.5 text-center lg:h-full lg:justify-center lg:gap-4 lg:rounded-3xl lg:border lg:bg-surface lg:p-6 lg:shadow-xl lg:shadow-black/25 ${style.ring}`}
    >
      <div className="lg:space-y-1">
        <h2 className={`font-display text-base font-bold lg:text-xl ${style.text}`}>
          {style.title} <span className="font-semibold text-text lg:hidden" lang={language}>· {lang.native}</span>
        </h2>
        <p className="hidden text-sm text-muted lg:block">
          <span lang={language}>{lang.native}</span>
          {lang.native !== lang.name && <span> · {lang.name}</span>}
        </p>
      </div>

      <span
        aria-hidden={!showTurn}
        className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold tracking-wide uppercase ${
          showTurn ? `${role === "customer" ? "bg-customer-soft" : "bg-vendor-soft"} ${style.text}` : "invisible"
        }`}
      >
        Your turn
      </span>

      <button
        type="button"
        onClick={recording ? onStop : onStart}
        disabled={recording ? false : disabled || working}
        aria-pressed={recording}
        aria-label={recording ? `Stop ${style.title.toLowerCase()} recording` : `Start ${style.title.toLowerCase()} recording`}
        style={{ "--pulse": style.pulse } as React.CSSProperties}
        className={`flex size-[5.25rem] touch-manipulation items-center justify-center rounded-full shadow-lg shadow-black/30 transition-transform select-none enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-35 lg:size-32 ${style.button} ${recording ? "mic-recording" : ""} ${showTurn ? "ring-4 ring-offset-4 ring-offset-surface lg:ring-offset-surface " + (role === "customer" ? "ring-customer/40" : "ring-vendor/40") : ""}`}
      >
        {recording ? (
          <StopIcon className="size-9 lg:size-12" />
        ) : working ? (
          <Spinner className="size-9 lg:size-12" />
        ) : (
          <MicIcon className="size-9 lg:size-12" />
        )}
      </button>

      <p className={`flex min-h-[2lh] items-start justify-center gap-1 text-[0.8rem] font-medium lg:min-h-0 lg:text-sm ${toneClass}`} aria-live="polite">
        {status.tone === "done" && <CheckIcon className="mt-0.5 size-3.5 shrink-0" />}
        <span>{status.text}</span>
      </p>
      {recording && <p className="hidden text-xs text-muted lg:block">Tap the button again when you finish.</p>}
      {error && (
        <p role="alert" className="w-full rounded-lg bg-danger-soft px-2 py-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
