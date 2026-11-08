import "server-only";
import type { LanguageCode } from "@/lib/languages";

export interface TranslationRequest {
  text: string;
  source: LanguageCode;
  target: LanguageCode;
  signal?: AbortSignal;
}

export interface CompletionRequest {
  system: string;
  user: string;
  /** Ask for a JSON object response. */
  json?: boolean;
  signal?: AbortSignal;
}

/** Implement this and register it in translate.ts to add another provider. */
export interface TranslationProvider {
  name: string;
  /** Env vars that are required but unset. */
  missingEnv(): string[];
  translate(request: TranslationRequest): Promise<string>;
  /** A raw completion, used for tasks other than translation (the conversation summary). */
  complete(request: CompletionRequest): Promise<string>;
  /** A free check that the credentials and model work, if the provider offers one. */
  check?(): Promise<{ ok: boolean; message: string }>;
}
