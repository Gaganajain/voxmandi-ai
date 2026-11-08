import { getLanguage, type LanguageCode } from "@/lib/languages";
import type { HealthResponse, ServiceId } from "@/lib/types/conversation";
import { LogoMark } from "./logo";
import { StatusIndicator, type AppMode } from "./status-indicator";

export function AppHeader({
  customerLang,
  vendorLang,
  mode,
  health,
  serviceResults,
  onRecheck,
}: {
  customerLang: LanguageCode;
  vendorLang: LanguageCode;
  mode: AppMode;
  health: HealthResponse | null;
  serviceResults: Partial<Record<ServiceId, boolean>>;
  onRecheck: () => void;
}) {
  const customer = getLanguage(customerLang);
  const vendor = getLanguage(vendorLang);
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <a href="#" className="flex min-w-0 shrink-0 items-center gap-2" aria-label="MarketMitra AI home">
          <LogoMark className="size-7 shrink-0 sm:size-9" />
          <span className="min-w-0">
            <span className="block font-display text-[0.95rem] leading-tight font-extrabold tracking-tight whitespace-nowrap sm:text-lg">
              MarketMitra <span className="text-accent">AI</span>
            </span>
            <span className="hidden text-xs text-muted sm:block">Your voice. Your market. Your connection.</span>
          </span>
        </a>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span
            className="flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1.5 text-xs font-semibold whitespace-nowrap max-[379px]:hidden sm:px-2.5"
            aria-label={`Customer speaks ${customer.name}, vendor speaks ${vendor.name}`}
          >
            <span className="text-customer" lang={customerLang}>{customer.native}</span>
            <span aria-hidden="true" className="text-muted">⇄</span>
            <span className="text-vendor" lang={vendorLang}>{vendor.native}</span>
          </span>
          <StatusIndicator mode={mode} health={health} serviceResults={serviceResults} onRecheck={onRecheck} />
        </div>
      </div>
    </header>
  );
}
