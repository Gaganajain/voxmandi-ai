import { env } from "@/lib/config/env";
import { getTranslationProvider } from "@/lib/translation/translate";
import type { HealthResponse, ServiceHealth } from "@/lib/types/conversation";

export const dynamic = "force-dynamic";

/**
 * Reports configuration, never values. Cerebras has a free endpoint to check the
 * key against. Gnani documents none, and a test call would spend credit, so its
 * status only means a key is present.
 */
export async function GET() {
  const gnaniMissing = env.gnaniApiKey() ? [] : ["GNANI_API_KEY"];
  const gnani = (label: string): ServiceHealth => ({
    label,
    provider: "Gnani",
    configured: gnaniMissing.length === 0,
    missing: gnaniMissing,
  });

  const provider = getTranslationProvider();
  const missing = provider ? provider.missingEnv() : ["TRANSLATION_PROVIDER"];
  const translate: ServiceHealth = {
    label: "Translation",
    provider: provider?.name ?? "Unknown",
    configured: missing.length === 0,
    missing,
    check: provider?.check && missing.length === 0 ? await provider.check() : undefined,
  };

  const services = { stt: gnani("Speech recognition"), translate, tts: gnani("Text-to-speech") };
  const all = Object.values(services);
  const mode: HealthResponse["mode"] = !all.every((s) => s.configured)
    ? "CONFIGURATION_REQUIRED"
    : all.some((s) => s.check?.ok === false)
      ? "API_ERROR"
      : "LIVE";

  const body: HealthResponse = { mode, services };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
