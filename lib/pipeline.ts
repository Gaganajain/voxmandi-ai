import "server-only";
import { toPublicError } from "@/lib/errors";
import { transcribe } from "@/lib/gnani/stt";
import { synthesize } from "@/lib/gnani/tts";
import { translate } from "@/lib/translation/translate";
import type { PipelineEvent, Stage } from "@/lib/types/conversation";
import type { TranslateRequest } from "@/lib/validation/schemas";

/**
 * Audio → speech recognition → translation → speech synthesis, for either
 * speaker: the direction comes entirely from `source` and `target`. Each result
 * is emitted as soon as it exists, so a later failure keeps the earlier text.
 */
export async function* runPipeline(
  { audio, transcript, translation, source, target }: TranslateRequest,
  signal?: AbortSignal,
): AsyncGenerator<PipelineEvent> {
  let stage: Stage = "stt";
  try {
    if (!transcript) {
      yield { type: "stage", stage };
      transcript = await transcribe(audio!, source, signal);
      yield { type: "transcript", text: transcript };
    }

    if (!translation) {
      stage = "translate";
      yield { type: "stage", stage };
      translation = await translate({ text: transcript, source, target, signal });
      yield { type: "translation", text: translation };
    }

    stage = "tts";
    yield { type: "stage", stage };
    const speech = await synthesize(translation, target, signal);
    yield { type: "audio", ...speech };

    yield { type: "done" };
  } catch (err) {
    if (signal?.aborted) return;
    yield { type: "error", stage, error: toPublicError(err) };
  }
}
