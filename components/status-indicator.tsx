import type { HealthResponse, ServiceId } from "@/lib/types/conversation";

export type AppMode = "LIVE" | "DEMO" | "CONFIGURATION_REQUIRED" | "API_ERROR" | "CHECKING";

const MODE_STYLES: Record<AppMode, { label: string; short: string; className: string; dot: string }> = {
  LIVE: { label: "LIVE", short: "LIVE", className: "bg-live-soft text-live", dot: "bg-live" },
  DEMO: { label: "DEMO", short: "DEMO", className: "bg-warn-soft text-warn", dot: "bg-warn" },
  CONFIGURATION_REQUIRED: { label: "CONFIGURATION REQUIRED", short: "SETUP", className: "bg-danger-soft text-danger", dot: "bg-danger" },
  API_ERROR: { label: "API ERROR", short: "ERROR", className: "bg-danger-soft text-danger", dot: "bg-danger" },
  CHECKING: { label: "Checking…", short: "…", className: "bg-raised text-muted", dot: "bg-muted" },
};

const SERVICE_ORDER: ServiceId[] = ["stt", "translate", "tts"];

/**
 * LIVE only when every service has a key, no free check failed, and no real
 * call failed this session. A later success clears a failure.
 */
export function deriveMode(
  demo: boolean,
  health: HealthResponse | null,
  loaded: boolean,
  serviceResults: Partial<Record<ServiceId, boolean>>,
): AppMode {
  if (demo) return "DEMO";
  if (!loaded) return "CHECKING";
  if (!health) return "API_ERROR";
  if (health.mode === "CONFIGURATION_REQUIRED") return "CONFIGURATION_REQUIRED";
  if (health.mode === "API_ERROR" || Object.values(serviceResults).includes(false)) return "API_ERROR";
  return "LIVE";
}

function describe(
  service: HealthResponse["services"][ServiceId],
  lastResult: boolean | undefined,
): { text: string; good: boolean } {
  if (!service.configured) return { text: `Missing ${service.missing.join(", ")}`, good: false };
  if (lastResult === false) return { text: "Last call failed", good: false };
  if (lastResult === true) return { text: "Working this session", good: true };
  if (service.check) return { text: service.check.message, good: service.check.ok };
  return { text: "Key set, not used yet", good: true };
}

export function StatusIndicator({
  mode,
  health,
  serviceResults,
  onRecheck,
}: {
  mode: AppMode;
  health: HealthResponse | null;
  serviceResults: Partial<Record<ServiceId, boolean>>;
  onRecheck: () => void;
}) {
  const style = MODE_STYLES[mode];
  return (
    <details className="relative">
      <summary
        aria-label={`API status: ${style.label}. Show details`}
        className={`flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 py-1.5 sm:min-h-0 sm:px-3 text-xs font-bold tracking-wide whitespace-nowrap [&::-webkit-details-marker]:hidden ${style.className}`}
      >
        <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
        <span className="sm:hidden">{style.short}</span>
        <span className="hidden sm:inline">{style.label}</span>
        <span aria-hidden="true" className="opacity-70">▾</span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-raised p-4 text-sm shadow-2xl shadow-black/40">
        <h2 className="font-semibold">API status</h2>
        {mode === "DEMO" && <p className="mt-1 text-xs text-warn">Showing the demo sample. Live services are not used.</p>}
        {health ? (
          <ul className="mt-3 space-y-2.5">
            {SERVICE_ORDER.map((id) => {
              const service = health.services[id];
              const { text, good } = describe(service, serviceResults[id]);
              return (
                <li key={id} className="flex items-start gap-2.5">
                  <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${good ? "bg-live" : "bg-danger"}`} />
                  <span>
                    <span className="font-medium">{service.label}</span>{" "}
                    <span className="text-muted">· {service.provider}</span>
                    <span className={`block text-xs ${good ? "text-muted" : "text-danger"}`}>{text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-muted">Status is unavailable: the server could not be reached.</p>
        )}
        <p className="mt-3 text-[0.7rem] text-muted">
          Gnani has no free test call, so it shows as working once a real request succeeds.
        </p>
        <button
          type="button"
          onClick={onRecheck}
          className="mt-3 min-h-10 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface sm:min-h-0"
        >
          Check again
        </button>
      </div>
    </details>
  );
}
