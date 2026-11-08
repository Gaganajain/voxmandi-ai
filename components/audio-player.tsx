import type { Playback } from "@/hooks/use-conversation";
import { PauseIcon, PlayIcon, Spinner } from "./icons";

/** Play / pause control for one generated clip; all clips share one audio element. */
export function AudioPlayer({
  status,
  languageName,
  error,
  onToggle,
  size = "md",
}: {
  status: Playback["status"] | null;
  languageName: string;
  error?: string;
  onToggle: () => void;
  size?: "sm" | "md";
}) {
  const label =
    status === "playing" ? `Pause ${languageName} audio` : status === "loading" ? `Loading ${languageName} audio` : `Play ${languageName} audio`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        className={`inline-flex touch-manipulation items-center gap-2 rounded-full bg-accent font-semibold text-on-accent hover:brightness-110 ${
          size === "sm" ? "px-3.5 py-2 text-sm sm:px-3 sm:py-1.5 sm:text-xs" : "px-5 py-3 text-base sm:px-4 sm:py-2 sm:text-sm"
        }`}
      >
        {status === "loading" ? (
          <Spinner className="size-4" />
        ) : status === "playing" ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4" />
        )}
        {status === "playing" ? "Pause" : status === "paused" ? "Resume" : "Play"} {languageName}
        {status === "playing" && (
          <span aria-hidden="true" className="flex h-3 items-end gap-0.5">
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="w-0.5 animate-pulse rounded bg-on-accent" style={{ height: "100%", animationDelay: `${delay}ms` }} />
            ))}
          </span>
        )}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
