import type { Role } from "@/lib/types/conversation";

/** Units the cart understands. Conversions exist only inside a dimension (see lib/cart/cart.ts). */
export type Unit = "kg" | "g" | "l" | "ml" | "piece" | "dozen";

export interface Quantity {
  value: number;
  /** null when the speaker gave a number without a recognisable unit. */
  unit: Unit | null;
}

/** "₹amount for forValue unit", exactly as the vendor said it, e.g. ₹60 for 2 kg. */
export interface UnitPrice {
  /** Rupees. */
  amount: number;
  forValue: number;
  /** null when the vendor did not say what the price covers. */
  unit: Unit | null;
}

/** What a speaker did to the cart in one turn, as read from the conversation. */
export type CartAction =
  /** Customer asks for a product. */
  | "add"
  /** Customer explicitly asks for more of a product already requested. */
  | "add_more"
  /** Customer explicitly changes an earlier quantity. */
  | "set_quantity"
  /** Customer clearly cancels a product. */
  | "remove"
  /** Vendor states or corrects a price. */
  | "price"
  /** Question, bargaining offer, or anything that does not change the cart. */
  | "other";

/** Structured cart fields attached to each market-notes item by /api/summary. */
export interface CartSignal {
  action: CartAction;
  quantity: Quantity | null;
  price: UnitPrice | null;
  variant: string | null;
}

export interface CartItemSource {
  speaker: Role | "manual";
  /** The words in the conversation this came from. */
  quote?: string;
  turnId?: string;
}

/** A question the customer must answer before the item is usable. */
export type CartQuestion =
  | { kind: "add_or_replace"; quantity: Quantity }
  | { kind: "remove" };

/**
 * pending: read from the conversation, not yet checked by the customer.
 * needs_review: the conversation was unclear or a number could not be verified.
 * confirmed: the customer checked, edited or entered it.
 */
export type ItemConfirmation = "pending" | "needs_review" | "confirmed";

export interface CartItem {
  id: string;
  name: string;
  variant: string | null;
  /** Matching key: normalised name + variant. */
  key: string;
  /** null: quantity missing. */
  quantity: Quantity | null;
  /** null: the vendor has not given a price. */
  price: UnitPrice | null;
  confirmation: ItemConfirmation;
  notes: string[];
  question?: CartQuestion;
  /** The vendor changed a price that was already set. */
  priceCorrected?: boolean;
  sources: CartItemSource[];
}

export type CartStatus = "active" | "reviewing";

export interface Cart {
  id: string;
  status: CartStatus;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
  /** Vendor prices heard before the customer asked for the product, by key. */
  pendingPrices: Record<string, { price: UnitPrice; source: CartItemSource; needsReview: boolean }>;
  /** Conversation turns already applied, so each is applied once. */
  appliedTurnIds: string[];
}

export type ItemProblem = "quantity_missing" | "price_missing" | "unit_mismatch" | "needs_review" | "question";

export interface PurchaseItem {
  id: string;
  name: string;
  variant: string | null;
  quantity: Quantity;
  price: UnitPrice;
  /** Paise. */
  totalPaise: number;
}

/** A purchase the customer explicitly confirmed. Stored in this browser only. */
export interface Purchase {
  id: string;
  cartId: string;
  status: "confirmed";
  createdAt: string;
  confirmedAt: string;
  items: PurchaseItem[];
  /** Paise. */
  grandTotalPaise: number;
}
