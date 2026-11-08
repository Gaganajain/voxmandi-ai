import "server-only";

function read(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/** Read on every call so edits to .env.local apply without code changes. */
export const env = {
  gnaniApiKey: () => read("GNANI_API_KEY"),
  gnaniSttUrl: () => read("GNANI_STT_URL") ?? "https://api.vachana.ai/stt/v3",
  gnaniTtsUrl: () =>
    read("GNANI_TTS_URL") ?? "https://api.vachana.ai/api/v1/tts/inference",
  translationProvider: () => read("TRANSLATION_PROVIDER") ?? "groq",
  groqApiKey: () => read("GROQ_API_KEY"),
  groqModel: () => read("GROQ_MODEL") ?? "openai/gpt-oss-120b",
  groqApiUrl: () =>
    (read("GROQ_API_URL") ?? "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
  cerebrasApiKey: () => read("CEREBRAS_API_KEY"),
  cerebrasModel: () => read("CEREBRAS_MODEL") ?? "gpt-oss-120b",
  cerebrasApiUrl: () =>
    (read("CEREBRAS_API_URL") ?? "https://api.cerebras.ai/v1").replace(/\/+$/, ""),
};
