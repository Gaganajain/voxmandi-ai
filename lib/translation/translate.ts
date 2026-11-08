import "server-only";
import { env } from "@/lib/config/env";
import { ServiceError } from "@/lib/errors";
import { cerebrasProvider } from "./cerebras";
import { groqProvider } from "./groq";
import type { TranslationProvider, TranslationRequest } from "./provider";

const PROVIDERS: Record<string, TranslationProvider> = {
  groq: groqProvider,
  cerebras: cerebrasProvider,
};

/** Undefined when TRANSLATION_PROVIDER names a provider that does not exist. */
export function getTranslationProvider(): TranslationProvider | undefined {
  return PROVIDERS[env.translationProvider().toLowerCase()];
}

export async function translate(request: TranslationRequest): Promise<string> {
  const provider = getTranslationProvider();
  if (!provider) {
    throw new ServiceError("NOT_CONFIGURED", "TRANSLATION_PROVIDER in .env.local names an unknown provider. Use: groq or cerebras.");
  }
  return provider.translate(request);
}
