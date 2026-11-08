import { LogoMark } from "./logo";

export function SiteFooter({ translationProvider }: { translationProvider?: string }) {
  return (
    <footer className="mx-auto mt-10 flex max-w-6xl flex-col items-center justify-between gap-2 border-t border-line/70 px-4 pt-5 pb-64 text-xs text-muted sm:flex-row lg:pb-8">
      <span className="flex items-center gap-2">
        <LogoMark className="size-5" />
        <span>
          <span className="font-semibold text-text">MarketMitra AI</span> · Your voice. Your market. Your connection.
        </span>
      </span>
      <span>
        Speech by Gnani · Translation by {translationProvider ?? "AI"}
      </span>
    </footer>
  );
}
