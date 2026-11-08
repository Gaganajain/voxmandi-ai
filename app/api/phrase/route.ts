import { z } from "zod";
import { toPublicError } from "@/lib/errors";
import { LANGUAGE_CODES, type LanguageCode } from "@/lib/languages";
import { getPhrase, PHRASES } from "@/lib/phrases";
import { translate } from "@/lib/translation/translate";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.enum(PHRASES.map((p) => p.id) as [string, ...string[]]),
  languages: z.array(z.enum(LANGUAGE_CODES)).min(1).max(2),
});

/** The phrase list is fixed, so translations are cached for the life of the server. */
const cache = new Map<string, string>();

async function phraseIn(id: string, text: string, language: LanguageCode, signal: AbortSignal) {
  if (language === "en-IN") return text;
  const key = `${id}:${language}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const translated = await translate({ text, source: "en-IN", target: language, signal });
  cache.set(key, translated);
  return translated;
}

/** Translates one starter phrase into the requested languages with the live provider. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { code: "BAD_REQUEST", message: "Unknown phrase.", retryable: false } }, { status: 400 });
  }
  const phrase = getPhrase(parsed.data.id)!;
  try {
    const texts = await Promise.all(
      parsed.data.languages.map((language) => phraseIn(phrase.id, phrase.text, language, request.signal)),
    );
    return Response.json({ texts }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: toPublicError(err) }, { status: 502 });
  }
}
