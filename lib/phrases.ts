import type { Role } from "@/lib/types/conversation";

/**
 * Starter phrases, written in English and translated on demand by the live
 * translation provider into whichever languages are selected.
 */
export const PHRASES: { id: string; role: Role; text: string }[] = [
  { id: "c-cost", role: "customer", text: "How much does this cost?" },
  { id: "c-two-kilo", role: "customer", text: "I need two kilos." },
  { id: "c-reduce", role: "customer", text: "Can you reduce the price?" },
  { id: "c-fresh", role: "customer", text: "Do you have fresh tomatoes?" },
  { id: "c-buy", role: "customer", text: "I want to buy this." },
  { id: "c-today", role: "customer", text: "Is this available today?" },
  { id: "v-quantity", role: "vendor", text: "What quantity do you need?" },
  { id: "v-price", role: "vendor", text: "This costs 60 rupees." },
  { id: "v-fresh", role: "vendor", text: "We have fresh tomatoes." },
  { id: "v-else", role: "vendor", text: "Would you like anything else?" },
  { id: "v-fixed", role: "vendor", text: "The price is fixed." },
];

export function getPhrase(id: string) {
  return PHRASES.find((p) => p.id === id);
}
