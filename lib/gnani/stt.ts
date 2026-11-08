import "server-only";
import { env } from "@/lib/config/env";
import { commonStatusError, fetchUpstreamWithRetry, gatewayError, isGatewayError, ServiceError } from "@/lib/errors";
import type { LanguageCode } from "@/lib/languages";

const SERVICE = "Gnani speech recognition";
const TIMEOUT_MS = 30_000;

/** REST STT accepts these; Gnani detects the format from the file extension. */
const ALLOWED_EXTENSIONS = ["wav", "mp3", "ogg", "flac", "aac", "m4a"];
/** 30 s of 16 kHz mono WAV is about 1 MB, so this only rejects abuse. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /stt/v3 (docs.gnani.ai/api/STT/speech-to-text).
 * Uses the default Prisma v2.5, documented for single-language audio, with
 * format=transcribe so spoken numbers come back as digits.
 */
export async function transcribe(
  audio: File,
  language: LanguageCode,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = env.gnaniApiKey();
  if (!apiKey) {
    throw new ServiceError("NOT_CONFIGURED", "Speech recognition is not configured: set GNANI_API_KEY in .env.local.", true);
  }
  if (audio.size === 0) {
    throw new ServiceError("EMPTY_AUDIO", "No audio was captured. Please record again.");
  }
  if (audio.size > MAX_BYTES) {
    throw new ServiceError("AUDIO_TOO_LONG", "That recording is too large. Keep it under 30 seconds.");
  }
  const extension = audio.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new ServiceError("UNSUPPORTED_AUDIO", "That audio format is not supported.");
  }

  const form = new FormData();
  form.append("audio_file", audio, audio.name);
  form.append("language_code", language);
  form.append("format", "transcribe");

  const res = await fetchUpstreamWithRetry(
    SERVICE,
    env.gnaniSttUrl(),
    { method: "POST", headers: { "X-API-Key-ID": apiKey }, body: form },
    TIMEOUT_MS,
    signal,
  );

  if (isGatewayError(res)) {
    console.error(`Gnani STT gateway error after retries: status=${res.status}`);
    throw gatewayError(SERVICE);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const type: string | undefined = body?.error?.type ?? body?.detail?.error_code ?? body?.code;
    console.error(`Gnani STT failed: status=${res.status} type=${type ?? "unknown"}`);
    throw sttError(res.status, type);
  }

  if (typeof body?.transcript !== "string") {
    throw new ServiceError("INVALID_RESPONSE", `${SERVICE} returned an unexpected response.`, true);
  }
  const transcript = body.transcript.trim();
  if (!transcript) {
    throw new ServiceError("NO_SPEECH", "No speech was recognised. Please speak clearly and record again.");
  }
  return transcript;
}

function sttError(status: number, type?: string): ServiceError {
  const common = commonStatusError(SERVICE, status, "GNANI_API_KEY");
  if (common) return common;

  switch (type) {
    case "EMPTY_AUDIO":
      return new ServiceError("EMPTY_AUDIO", "No audio was captured. Please record again.");
    case "UNSUPPORTED_AUDIO_FORMAT":
    case "AUDIO_CONVERSION_ERROR":
      return new ServiceError("UNSUPPORTED_AUDIO", "Gnani could not read this audio. Please record again.");
    case "MAX_AUDIO_DURATION_EXCEEDED":
      return new ServiceError("AUDIO_TOO_LONG", "That recording is too long. Keep it under 30 seconds.");
    case "INVALID_LANGUAGE_CODE":
    case "MODEL_UNSUPPORTED_LANGUAGE":
      return new ServiceError("UNSUPPORTED_LANGUAGE", "Gnani does not support speech recognition for this language.");
  }
  if (status === 504) {
    return new ServiceError("TIMEOUT", `${SERVICE} took too long to respond.`, true);
  }
  if (status >= 500) {
    return new ServiceError("UPSTREAM", `${SERVICE} is having trouble. Please retry.`, true);
  }
  return new ServiceError("BAD_REQUEST", `${SERVICE} rejected the request (HTTP ${status}).`);
}
