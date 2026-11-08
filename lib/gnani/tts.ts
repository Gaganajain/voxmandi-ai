import "server-only";
import { env } from "@/lib/config/env";
import { commonStatusError, fetchUpstreamWithRetry, gatewayError, isGatewayError, ServiceError } from "@/lib/errors";
import type { LanguageCode } from "@/lib/languages";

const SERVICE = "Gnani text-to-speech";
const TIMEOUT_MS = 30_000;
const MODEL = "timbre-v2.5";

/** Timbre v2.5 voices by preferred language (docs.gnani.ai/api/TTS/available-voices). */
const VOICES: Record<LanguageCode, string> = {
  "kn-IN": "Saanvi",
  "hi-IN": "Nalini",
  "ta-IN": "Asmita",
  "te-IN": "Lavanya",
  "ml-IN": "Reshma",
  "mr-IN": "Zahira",
  "bn-IN": "Kirra",
  "gu-IN": "Falak",
  "pa-IN": "Mehuli",
  "en-IN": "Kaveri",
};

/**
 * POST /api/v1/tts/inference (docs.gnani.ai/api/TTS/tts-inference). This REST
 * endpoint returns the whole clip as binary audio, which suits a replayable
 * message better than the chunked SSE variant. Digits and ₹ are normalised
 * by the service when `language` is explicit, so text is sent as-is.
 */
export async function synthesize(
  text: string,
  language: LanguageCode,
  signal?: AbortSignal,
): Promise<{ base64: string; mimeType: string }> {
  const apiKey = env.gnaniApiKey();
  if (!apiKey) {
    throw new ServiceError("NOT_CONFIGURED", "Text-to-speech is not configured: set GNANI_API_KEY in .env.local.", true);
  }

  const res = await fetchUpstreamWithRetry(
    SERVICE,
    env.gnaniTtsUrl(),
    {
      method: "POST",
      headers: { "X-API-Key-ID": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model: MODEL,
        voice: VOICES[language],
        language,
        speed: 1.0,
        audio_config: {
          container: "mp3",
          bitrate: "128k",
          sample_rate: 44100,
          num_channels: 1,
        },
      }),
    },
    TIMEOUT_MS,
    signal,
  );

  if (isGatewayError(res)) {
    console.error(`Gnani TTS gateway error after retries: status=${res.status}`);
    throw gatewayError(SERVICE);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    console.error(`Gnani TTS failed: status=${res.status} code=${body?.detail?.error_code ?? "unknown"}`);
    const common = commonStatusError(SERVICE, res.status, "GNANI_API_KEY");
    if (common) throw common;
    if (res.status === 400) {
      throw new ServiceError("BAD_REQUEST", `${SERVICE} rejected the request (HTTP 400).`);
    }
    throw new ServiceError("UPSTREAM", `${SERVICE} is having trouble. Please retry.`, true);
  }

  const mimeType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!mimeType.startsWith("audio/") || bytes.length === 0) {
    console.error(`Gnani TTS invalid audio: type=${mimeType || "none"} bytes=${bytes.length}`);
    throw new ServiceError("INVALID_RESPONSE", `${SERVICE} did not return playable audio.`, true);
  }
  return { base64: bytes.toString("base64"), mimeType };
}
