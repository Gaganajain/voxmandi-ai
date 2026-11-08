import "server-only";
import { env } from "@/lib/config/env";
import { createOpenAICompatibleProvider } from "./openai-compatible";

/** https://inference-docs.cerebras.ai/api-reference/chat-completions */
export const cerebrasProvider = createOpenAICompatibleProvider({
  name: "Cerebras",
  keyVar: "CEREBRAS_API_KEY",
  modelVar: "CEREBRAS_MODEL",
  apiKey: env.cerebrasApiKey,
  model: env.cerebrasModel,
  baseUrl: env.cerebrasApiUrl,
  // qwen can switch reasoning off; gpt-oss cannot, so use the lowest effort and hide it.
  reasoningParams: (model) => {
    if (model.startsWith("qwen")) return { reasoning_effort: "none" };
    if (model.startsWith("gpt-oss")) return { reasoning_effort: "low", reasoning_format: "hidden" };
    return {};
  },
});
