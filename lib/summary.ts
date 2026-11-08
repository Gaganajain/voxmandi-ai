import "server-only";
import { z } from "zod";
import { ServiceError } from "@/lib/errors";
import { getLanguage } from "@/lib/languages";
import { getTranslationProvider } from "@/lib/translation/translate";
import { normalizeUnit } from "@/lib/cart/cart";
import type { CartSignal } from "@/lib/types/cart";
import type { SummaryItem } from "@/lib/types/conversation";
import type { SummaryRequest } from "@/lib/validation/schemas";

const SYSTEM = `You read a conversation between a customer and a street vendor at an Indian market and list the market facts that were explicitly said. Each turn has the original words and a machine translation.

Return JSON: {"items": [{"turn": number, "product": string, "quantity": string | null, "price": string | null, "quote": string, "uncertain": boolean, "note": string | null, "action": string, "qty": number | null, "unit": string | null, "rupees": number | null, "per_qty": number | null, "per_unit": string | null, "variant": string | null}]}

Rules:
- One item per product per turn where a product, quantity or price is mentioned.
- "product": the product's common English name.
- "quantity": only if said, written with digits and units, e.g. "2 kg", "1 dozen". Otherwise null.
- "price": only if a price was actually stated, written as "₹60" plus what it covers if said, e.g. "₹60 for 2 kg". A question such as "how much?" has no price: use null. A bargaining offer is a price, but say so in "note".
- "quote": copy the exact words from that turn's original or translation that contain the fact.
- "uncertain": true if the original and translation disagree, if speech recognition may have misheard, or if anything is ambiguous; explain in "note".
- Never invent products, quantities, prices, totals or purchases. Do not compute a bill. Do not say anything was bought.
- If nothing qualifies, return {"items": []}.

Shopping-cart fields (used to build the customer's cart; report only what this turn says):
- "product": use the same singular English name for the same product in every turn (e.g. always "tomato"). If the turn says "it", "that" or "one kilogram costs 40" without naming the product, use the product it clearly refers to from earlier turns; if that is not clear, set "uncertain": true.
- "action", one of:
  - "add": the customer asks to buy a product, e.g. "I need 2 kg tomatoes", "give me onions too".
  - "add_more": the customer explicitly wants more of a product already asked for, e.g. "one more kilo of tomatoes".
  - "set_quantity": the customer explicitly changes an earlier amount, e.g. "actually make that 3 kg", "no, only 1 kg".
  - "remove": the customer cancels a product, e.g. "I don't want onions".
  - "price": the vendor states or corrects a price.
  - "other": questions ("how much are tomatoes?"), bargaining offers that were not accepted, and anything else.
- "qty" and "unit": the customer's amount as a number and one of "kg", "g", "l", "ml", "piece", "dozen", exactly as said, never converted ("half a kilo" is 0.5 kg; "6 bananas" is 6 piece). null if not said. Keep "unit" null if the unit is not clear.
- "rupees", "per_qty", "per_unit": the vendor's price and the amount it is for, as said: "40 per kg" is 40, 1, "kg"; "60 for 2 kg" is 60, 2, "kg"; "10 each" is 10, 1, "piece". null if not said. Keep "per_unit" null if it is not clear what the price covers.
- "variant": a variety that distinguishes the product, e.g. "red", "small", "Nashik", else null.
- Write numbers said in words as digits in these fields, and set "uncertain": true when the action is ambiguous.`;

const positive = z.number().finite().positive().max(100_000).nullable().optional().catch(null);

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
      action: z.enum(["add", "add_more", "set_quantity", "remove", "price", "other"]).catch("other"),
      qty: positive,
      unit: z.unknown().transform(normalizeUnit),
      rupees: z.number().finite().nonnegative().max(10_000_000).nullable().optional().catch(null),
      per_qty: positive,
      per_unit: z.unknown().transform(normalizeUnit),
      variant: z.string().trim().max(60).nullable().optional().catch(null),
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

/** The cart fields of one model item. Numbers are verified against the turn text by the caller. */
function cartSignal(item: z.infer<typeof modelOutput>["items"][number]): CartSignal {
  return {
    action: item.action,
    quantity: item.qty != null ? { value: item.qty, unit: item.unit } : null,
    price: item.rupees != null ? { amount: item.rupees, forValue: item.per_qty ?? 1, unit: item.per_unit } : null,
    variant: item.variant || null,
  };
}

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
    const cart = cartSignal(item);
    // A per-quantity of 1 ("per kg") is usually not said as a digit.
    const cartNumbers = [cart.quantity?.value, cart.price?.amount, cart.price && cart.price.forValue !== 1 ? cart.price.forValue : undefined];
    const unverified =
      [item.quantity, item.price].some(
        (value) => value !== null && (numbersIn(value).length === 0 || numbersIn(value).some((n) => !turnNumbers.has(n))),
      ) || cartNumbers.some((n) => n !== undefined && !turnNumbers.has(String(n)));

    const notes = [item.note, unverified ? "Number not written as digits in the conversation; check by ear" : null].filter(Boolean);
    items.push({
      product: item.product,
      quantity: item.quantity,
      price: item.price,
      speaker: turn.role,
      quote: item.quote,
      uncertain: item.uncertain || unverified,
      note: notes.length ? notes.join(". ") : undefined,
      turn: item.turn,
      cart,
    });
  }
  return items;
}
