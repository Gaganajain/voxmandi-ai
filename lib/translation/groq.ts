import "server-only";
import { env } from "@/lib/config/env";
import { createOpenAICompatibleProvider } from "./openai-compatible";

/** https://console.groq.com/docs/api-reference */
export const groqProvider = createOpenAICompatibleProvider({
  name: "Groq",
  keyVar: "GROQ_API_KEY",
  modelVar: "GROQ_MODEL",
  apiKey: env.groqApiKey,
  model: env.groqModel,
  baseUrl: env.groqApiUrl,
  // Per Groq's reasoning docs: gpt-oss takes include_reasoning (not reasoning_format)
  // and cannot switch reasoning off; qwen can, with "none".
  reasoningParams: (model) => {
    if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "low", include_reasoning: false };
    if (model.startsWith("qwen/")) return { reasoning_effort: "none" };
    return {};
  },
});
