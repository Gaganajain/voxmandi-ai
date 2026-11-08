import { runPipeline } from "@/lib/pipeline";
import { translateRequestSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return Response.json({ error: { code: "BAD_REQUEST", message, retryable: false } }, { status: 400 });
}

/** Responds with newline-delimited JSON, one PipelineEvent per line. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Expected a multipart/form-data request.");
  }

  const parsed = translateRequestSchema.safeParse({
    source: form.get("source"),
    target: form.get("target"),
    audio: form.get("audio") ?? undefined,
    transcript: form.get("transcript") ?? undefined,
    translation: form.get("translation") ?? undefined,
  });
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  const encoder = new TextEncoder();
  const events = runPipeline(parsed.data, request.signal);
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
