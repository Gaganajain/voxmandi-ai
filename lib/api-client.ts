import type { LanguageCode } from "@/lib/languages";
import type { HealthResponse, PipelineEvent, PublicError } from "@/lib/types/conversation";

export interface PipelineInput {
  source: LanguageCode;
  target: LanguageCode;
  wav?: Blob;
  transcript?: string;
  translation?: string;
}

class ApiError extends Error {
  constructor(public publicError: PublicError) {
    super(publicError.message);
  }
}

/** Calls onEvent per pipeline event. Throws PublicError-carrying ApiError on transport failures. */
export async function streamPipeline(
  input: PipelineInput,
  onEvent: (event: PipelineEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const form = new FormData();
  form.append("source", input.source);
  form.append("target", input.target);
  if (input.transcript) form.append("transcript", input.transcript);
  if (input.translation) form.append("translation", input.translation);
  if (input.wav && !input.transcript) form.append("audio", input.wav, "speech.wav");

  let res: Response;
  try {
    res = await fetch("/api/translate", { method: "POST", body: form, signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError({ code: "NETWORK", message: "Could not reach the server. Check your connection.", retryable: true });
  }

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      body?.error ?? { code: "INVALID_RESPONSE", message: `The server returned an error (HTTP ${res.status}).`, retryable: true },
    );
  }

  const invalid: PublicError = { code: "INVALID_RESPONSE", message: "The server sent an incomplete response. Please retry.", retryable: true };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let finished = false;

  const handleLine = (line: string) => {
    let event: PipelineEvent;
    try {
      event = JSON.parse(line);
    } catch {
      throw new ApiError(invalid);
    }
    if (event.type === "done" || event.type === "error") finished = true;
    onEvent(event);
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.filter(Boolean).forEach(handleLine);
    }
  } catch (err) {
    if (signal.aborted || err instanceof ApiError) throw err;
    throw new ApiError({ code: "NETWORK", message: "The connection was lost. Please retry.", retryable: true });
  }
  if (!finished) throw new ApiError(invalid);
}

export function publicErrorFrom(err: unknown): PublicError {
  if (err instanceof ApiError) return err.publicError;
  return { code: "UPSTREAM", message: "Something went wrong. Please retry.", retryable: true };
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
