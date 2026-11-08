import type { LanguageCode } from "@/lib/languages";
import type { CartSignal } from "@/lib/types/cart";

export type Role = "customer" | "vendor";
export type Stage = "stt" | "translate" | "tts";

export type ErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_CREDENTIALS"
  | "INSUFFICIENT_CREDIT"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK"
  | "EMPTY_AUDIO"
  | "NO_SPEECH"
  | "AUDIO_TOO_LONG"
  | "UNSUPPORTED_AUDIO"
  | "UNSUPPORTED_LANGUAGE"
  | "MODEL_NOT_FOUND"
  | "BAD_REQUEST"
  | "UPSTREAM"
  | "INVALID_RESPONSE";

export interface PublicError {
  code: ErrorCode;
  message: string;
  /** Whether sending the same input again could succeed. */
  retryable: boolean;
}

/** One line of the newline-delimited JSON stream sent by POST /api/translate. */
export type PipelineEvent =
  | { type: "stage"; stage: Stage }
  | { type: "transcript"; text: string }
  | { type: "translation"; text: string }
  | { type: "audio"; base64: string; mimeType: string }
  | { type: "error"; stage: Stage; error: PublicError }
  | { type: "done" };

export interface Turn {
  id: string;
  role: Role;
  source: LanguageCode;
  target: LanguageCode;
  status: "processing" | "done" | "error";
  stage?: Stage;
  transcript?: string;
  translation?: string;
  audioUrl?: string;
  error?: PublicError & { stage?: Stage };
  /** The recording, kept so a failed speech-recognition step can be retried. */
  wav?: Blob;
  /** Sample content for DEMO mode; never produced by a live service. */
  demo?: boolean;
}

export type ServiceId = Stage;

/** One fact in the conversation summary, checked against the conversation text. */
export interface SummaryItem {
  product: string;
  quantity: string | null;
  price: string | null;
  speaker: Role;
  /** The words in the conversation this came from. */
  quote: string;
  /** The model was unsure, or a number could not be found in the conversation text. */
  uncertain: boolean;
  /** Why it is uncertain, when it is. */
  note?: string;
  /** 1-based index of the turn in the request this came from. */
  turn: number;
  /** Structured fields for the shopping cart; the cart itself is computed in the browser. */
  cart: CartSignal;
}

export type SummaryResponse = { items: SummaryItem[] } | { error: PublicError };

export interface ServiceHealth {
  label: string;
  provider: string;
  configured: boolean;
  /** Env vars the user still has to set. */
  missing: string[];
  /** Result of a real check against the service, when one is free to run. */
  check?: { ok: boolean; message: string };
}

export interface HealthResponse {
  /**
   * LIVE: every service has a key and no free check failed.
   * CONFIGURATION_REQUIRED: a key or provider setting is missing.
   * API_ERROR: keys are set but a service rejected them.
   */
  mode: "LIVE" | "CONFIGURATION_REQUIRED" | "API_ERROR";
  services: Record<ServiceId, ServiceHealth>;
}
