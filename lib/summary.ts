import "server-only";
import { z } from "zod";
import { ServiceError } from "@/lib/errors";
import { getLanguage } from "@/lib/languages";
import { getTranslationProvider } from "@/lib/translation/translate";
import type { SummaryItem } from "@/lib/types/conversation";
import type { SummaryRequest } from "@/lib/validation/schemas";

const SYSTEM = `You read a conversation between a customer and a street vendor at an Indian market and list the market facts that were explicitly said. Each turn has the original words and a machine translation.

Return JSON: {"items": [{"turn": number, "product": string, "quantity": string | null, "price": string | null, "quote": string, "uncertain": boolean, "note": string | null}]}

Rules:
- One item per product per turn where a product, quantity or price is mentioned.
- "product": the product's common English name.
- "quantity": only if said, written with digits and units, e.g. "2 kg", "1 dozen". Otherwise null.
- "price": only if a price was actually stated, written as "₹60" plus what it covers if said, e.g. "₹60 for 2 kg". A question such as "how much?" has no price: use null. A bargaining offer is a price, but say so in "note".
- "quote": copy the exact words from that turn's original or translation that contain the fact.
- "uncertain": true if the original and translation disagree, if speech recognition may have misheard, or if anything is ambiguous; explain in "note".
- Never invent products, quantities, prices, totals or purchases. Do not compute a bill. Do not say anything was bought.
- If nothing qualifies, return {"items": []}.`;

const modelOutput = z.object({
  items: z.array(
    z.object({
      turn: z.number().int(),
      product: z.string().trim().min(1).max(80),
      quantity: z.string().trim().max(60).nullable().catch(null),
      price: z.string().trim().max(80).nullable().catch(null),
      quote: z.string().trim().max(400),
      uncertain: z.boolean().catch(true),
      note: z.string().trim().max(200).nullable().optional().catch(null),
    }),
  ).max(50),
});

/**
 * Converts Indian-script digits to ASCII so numbers can be compared across
 * scripts. In every Indic block, zero to nine sit at code points xx6 to xxF.
 */
function asciiDigits(text: string) {
  return text.replace(/[०-९০-৯੦-੯૦-૯௦-௯౦-౯೦-೯൦-൯]/g, (d) =>
    String((d.charCodeAt(0) & 0xf) - 6),
  );
}

/** For matching quotes: ignores spacing, case and sentence punctuation. */
const forMatching = (s: string) =>
  asciiDigits(s).replace(/[।॥.,!?;:"'“”‘’()]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const numbersIn = (s: string) => asciiDigits(s).match(/\d+(?:\.\d+)?/g) ?? [];

/**
 * Extracts products, quantities and prices with the configured LLM, then checks
 * each item against the conversation: items whose quote is not in the stated
 * turn are dropped, and any number not present in that turn is marked uncertain.
 */
export async function summarise({ turns }: SummaryRequest, signal?: AbortSignal): Promise<SummaryItem[]> {
  const provider = getTranslationProvider();
  if (!provider) {
    throw new ServiceError("NOT_CONFIGURED", "TRANSLATION_PROVIDER in .env.local names an unknown provider.");
  }

  const user = turns
    .map((t, i) =>
      [
        `Turn ${i + 1} (${t.role}):`,
        `Original (${getLanguage(t.source).name}): ${t.transcript}`,
        `Translation (${getLanguage(t.target).name}): ${t.translation ?? "(none)"}`,
      ].join("\n"),
    )
    .join("\n\n");

  const raw = await provider.complete({ system: SYSTEM, user, json: true, signal });
  let parsed: z.infer<typeof modelOutput>;
  try {
    parsed = modelOutput.parse(JSON.parse(raw));
  } catch {
    throw new ServiceError("INVALID_RESPONSE", `${provider.name} returned a summary in an unexpected format. Please retry.`, true);
  }

  const items: SummaryItem[] = [];
  for (const item of parsed.items) {
    const turn = turns[item.turn - 1];
    if (!turn) continue;
    const turnText = `${turn.transcript} ${turn.translation ?? ""}`;
    const quote = forMatching(item.quote);
    if (!quote || !forMatching(turnText).includes(quote)) continue;

    const turnNumbers = new Set(numbersIn(turnText));
    const unverified = [item.quantity, item.price].some(
      (value) => value !== null && (numbersIn(value).length === 0 || numbersIn(value).some((n) => !turnNumbers.has(n))),
    );

    const notes = [item.note, unverified ? "Number not written as digits in the conversation; check by ear" : null].filter(Boolean);
    items.push({
      product: item.product,
      quantity: item.quantity,
      price: item.price,
      speaker: turn.role,
      quote: item.quote,
      uncertain: item.uncertain || unverified,
      note: notes.length ? notes.join(". ") : undefined,
    });
  }
  return items;
}
