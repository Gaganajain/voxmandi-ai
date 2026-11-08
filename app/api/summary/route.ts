import { toPublicError } from "@/lib/errors";
import { summarise } from "@/lib/summary";
import type { SummaryResponse } from "@/lib/types/conversation";
import { summaryRequestSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = summaryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const body: SummaryResponse = {
      error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request.", retryable: false },
    };
    return Response.json(body, { status: 400 });
  }

  try {
    const body: SummaryResponse = { items: await summarise(parsed.data, request.signal) };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const body: SummaryResponse = { error: toPublicError(err) };
    return Response.json(body, { status: 502 });
  }
}
