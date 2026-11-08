// Deterministic cart logic tests. Run with `npm test` (Node 23.6+ loads the .ts file directly).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPurchase,
  cartReducer,
  cartSummary,
  createCart,
  formatPaise,
  itemKey,
  itemProblems,
  itemTotalPaise,
  normalizeUnit,
} from "../lib/cart/cart.ts";

const AT = "2026-01-01T10:00:00.000Z";
let n = 0;
const turnId = () => `t${++n}`;

/** One extracted mention, as /api/summary returns it. */
function said(product, action, { qty, unit, rupees, per = 1, perUnit, variant = null, uncertain = false, note } = {}) {
  return {
    product,
    quote: `${product} quote`,
    uncertain,
    note,
    cart: {
      action,
      quantity: qty == null ? null : { value: qty, unit: unit ?? null },
      price: rupees == null ? null : { amount: rupees, forValue: per, unit: perUnit ?? null },
      variant,
    },
  };
}
const customer = (...items) => ({ id: turnId(), role: "customer", items });
const vendor = (...items) => ({ id: turnId(), role: "vendor", items });

function play(...turns) {
  return cartReducer(createCart("cart-1", AT), { type: "apply_turns", at: AT, turns });
}
const byName = (cart, name) => cart.items.find((i) => i.name === name);

describe("multi-item cart from a conversation", () => {
  const cart = play(
    customer(said("tomato", "add", { qty: 2, unit: "kg" })),
    vendor(said("tomato", "price", { rupees: 40, perUnit: "kg" })),
    customer(said("onion", "add", { qty: 1, unit: "kg" })),
    vendor(said("onion", "price", { rupees: 30, perUnit: "kg" })),
    customer(said("potato", "add", { qty: 3, unit: "kg" })),
    vendor(said("potato", "price", { rupees: 25, perUnit: "kg" })),
  );

  it("keeps each product as a separate item with its own quantity and price", () => {
    assert.equal(cart.items.length, 3);
    assert.deepEqual(byName(cart, "tomato").quantity, { value: 2, unit: "kg" });
    assert.deepEqual(byName(cart, "onion").price, { amount: 30, forValue: 1, unit: "kg" });
  });

  it("calculates each item total and the grand total", () => {
    assert.equal(itemTotalPaise(byName(cart, "tomato")), 8000);
    assert.equal(itemTotalPaise(byName(cart, "onion")), 3000);
    assert.equal(itemTotalPaise(byName(cart, "potato")), 7500);
    assert.equal(cartSummary(cart).grandTotalPaise, 18500);
    assert.equal(formatPaise(18500), "₹185");
  });

  it("does not apply the same turn twice when a later summary repeats it", () => {
    const again = cartReducer(cart, {
      type: "apply_turns",
      at: AT,
      turns: [{ id: cart.appliedTurnIds[0], role: "customer", items: [said("tomato", "add_more", { qty: 2, unit: "kg" })] }],
    });
    assert.deepEqual(byName(again, "tomato").quantity, { value: 2, unit: "kg" });
  });

  it("adds another product without overwriting the first", () => {
    const more = cartReducer(cart, { type: "apply_turns", at: AT, turns: [customer(said("carrot", "add", { qty: 0.5, unit: "kg" }))] });
    assert.equal(more.items.length, 4);
    assert.deepEqual(byName(more, "tomato").quantity, { value: 2, unit: "kg" });
  });
});

describe("cart management", () => {
  it("updates a quantity when the customer explicitly changes it", () => {
    const cart = play(customer(said("tomato", "add", { qty: 2, unit: "kg" })), customer(said("tomatoes", "set_quantity", { qty: 3, unit: "kg" })));
    assert.equal(cart.items.length, 1);
    assert.deepEqual(cart.items[0].quantity, { value: 3, unit: "kg" });
  });

  it("adds to the quantity on an explicit 'more', converting grams to kg", () => {
    const cart = play(customer(said("tomato", "add", { qty: 2, unit: "kg" })), customer(said("tomato", "add_more", { qty: 500, unit: "g" })));
    assert.deepEqual(cart.items[0].quantity, { value: 2.5, unit: "kg" });
  });

  it("asks when a product is repeated with a different amount and no clear intent", () => {
    let cart = play(customer(said("tomato", "add", { qty: 2, unit: "kg" })), customer(said("tomato", "add", { qty: 1, unit: "kg" })));
    assert.equal(cart.items.length, 1, "no duplicate entry");
    assert.equal(cart.items[0].question?.kind, "add_or_replace");
    assert.ok(itemProblems(cart.items[0]).includes("question"));
    assert.equal(cartSummary(cart).grandTotalPaise, null);
    const added = cartReducer(cart, { type: "answer", at: AT, id: cart.items[0].id, choice: "add" });
    assert.deepEqual(added.items[0].quantity, { value: 3, unit: "kg" });
    cart = cartReducer(cart, { type: "answer", at: AT, id: cart.items[0].id, choice: "replace" });
    assert.deepEqual(cart.items[0].quantity, { value: 1, unit: "kg" });
  });

  it("treats the same request repeated as one item", () => {
    const cart = play(customer(said("tomato", "add", { qty: 2, unit: "kg" })), customer(said("tomato", "add", { qty: 2000, unit: "g" })));
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].question, undefined);
  });

  it("keeps different variants and incompatible units as separate entries", () => {
    const cart = play(
      customer(said("onion", "add", { qty: 1, unit: "kg" })),
      customer(said("onion", "add", { qty: 1, unit: "kg", variant: "red" })),
      customer(said("banana", "add", { qty: 1, unit: "dozen" })),
      customer(said("banana", "add", { qty: 1, unit: "kg" })),
    );
    assert.equal(cart.items.length, 4);
  });

  it("removes an item when the customer clearly cancels it", () => {
    const cart = play(customer(said("tomato", "add", { qty: 2, unit: "kg" }), said("onion", "add", { qty: 1, unit: "kg" })), customer(said("onion", "remove")));
    assert.deepEqual(cart.items.map((i) => i.name), ["tomato"]);
  });

  it("asks before removing when the removal is unclear", () => {
    const cart = play(customer(said("onion", "add", { qty: 1, unit: "kg" })), customer(said("onion", "remove", { uncertain: true })));
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].question?.kind, "remove");
    const kept = cartReducer(cart, { type: "answer", at: AT, id: cart.items[0].id, choice: "keep" });
    assert.equal(kept.items.length, 1);
    assert.equal(kept.items[0].question, undefined);
  });

  it("applies a vendor price correction to that product only", () => {
    const cart = play(
      customer(said("tomato", "add", { qty: 2, unit: "kg" }), said("onion", "add", { qty: 1, unit: "kg" })),
      vendor(said("tomato", "price", { rupees: 40, perUnit: "kg" }), said("onion", "price", { rupees: 30, perUnit: "kg" })),
      vendor(said("tomato", "price", { rupees: 35, perUnit: "kg" })),
    );
    assert.equal(byName(cart, "tomato").price.amount, 35);
    assert.equal(byName(cart, "tomato").priceCorrected, true);
    assert.equal(byName(cart, "onion").price.amount, 30);
    assert.equal(cartSummary(cart).grandTotalPaise, 7000 + 3000);
  });

  it("uses a price the vendor gave before the customer asked", () => {
    const cart = play(vendor(said("tomato", "price", { rupees: 60, per: 2, perUnit: "kg" })), customer(said("tomato", "add", { qty: 3, unit: "kg" })));
    assert.equal(itemTotalPaise(cart.items[0]), 9000);
  });

  it("ignores customer bargaining offers and vendor quantity talk", () => {
    const cart = play(customer(said("tomato", "add", { qty: 1, unit: "kg" })), customer(said("tomato", "price", { rupees: 20, perUnit: "kg" })), vendor(said("onion", "add", { qty: 5, unit: "kg" })));
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].price, null);
  });

  it("edits and removes items by hand", () => {
    let cart = play(customer(said("tomato", "add", { qty: 2, unit: "kg" })));
    const id = cart.items[0].id;
    cart = cartReducer(cart, { type: "edit", at: AT, id, quantity: { value: 1.5, unit: "kg" }, price: { amount: 40, forValue: 1, unit: "kg" } });
    assert.equal(cart.items[0].confirmation, "confirmed");
    assert.equal(itemTotalPaise(cart.items[0]), 6000);
    cart = cartReducer(cart, { type: "remove", at: AT, id });
    assert.equal(cart.items.length, 0);
  });
});

describe("missing and invalid information", () => {
  it("marks a missing quantity and does not total the item", () => {
    const cart = play(customer(said("onion", "add")), vendor(said("onion", "price", { rupees: 30, perUnit: "kg" })));
    assert.equal(cart.items[0].quantity, null);
    assert.ok(itemProblems(cart.items[0]).includes("quantity_missing"));
    assert.equal(itemTotalPaise(cart.items[0]), null);
    assert.equal(cartSummary(cart).grandTotalPaise, null);
  });

  it("marks a missing price as unavailable", () => {
    const cart = play(customer(said("onion", "add", { qty: 1, unit: "kg" })));
    assert.equal(cart.items[0].price, null);
    assert.ok(itemProblems(cart.items[0]).includes("price_missing"));
    assert.equal(cartSummary(cart).grandTotalPaise, null);
  });

  it("does not multiply kg by a per-piece price", () => {
    const cart = play(customer(said("coconut", "add", { qty: 2, unit: "kg" })), vendor(said("coconut", "price", { rupees: 40, perUnit: "piece" })));
    assert.equal(itemTotalPaise(cart.items[0]), null);
    assert.ok(itemProblems(cart.items[0]).includes("unit_mismatch"));
  });

  it("converts only exact units (g↔kg, ml↔l, dozen↔piece) and handles decimals", () => {
    assert.equal(itemTotalPaise({ quantity: { value: 250, unit: "g" }, price: { amount: 80, forValue: 1, unit: "kg" } }), 2000);
    assert.equal(itemTotalPaise({ quantity: { value: 1.5, unit: "l" }, price: { amount: 60, forValue: 1, unit: "l" } }), 9000);
    assert.equal(itemTotalPaise({ quantity: { value: 6, unit: "piece" }, price: { amount: 48, forValue: 1, unit: "dozen" } }), 2400);
    assert.equal(itemTotalPaise({ quantity: { value: 1, unit: "kg" }, price: { amount: 50, forValue: 3, unit: "kg" } }), 1667);
    assert.equal(itemTotalPaise({ quantity: { value: 1, unit: "l" }, price: { amount: 50, forValue: 1, unit: "kg" } }), null);
    assert.equal(itemTotalPaise({ quantity: { value: 2, unit: null }, price: { amount: 50, forValue: 1, unit: "kg" } }), null);
  });

  it("flags uncertain mentions for review until the customer checks them", () => {
    let cart = play(customer(said("tomato", "add", { qty: 2, unit: "kg", uncertain: true, note: "Number not written as digits" })), vendor(said("tomato", "price", { rupees: 40, perUnit: "kg" })));
    assert.equal(cart.items[0].confirmation, "needs_review");
    assert.equal(cartSummary(cart).grandTotalPaise, null);
    cart = cartReducer(cart, { type: "mark_checked", at: AT, id: cart.items[0].id });
    assert.equal(cartSummary(cart).grandTotalPaise, 8000);
  });

  it("normalises unit spellings and product plurals", () => {
    assert.equal(normalizeUnit("Kilograms"), "kg");
    assert.equal(normalizeUnit("ltr"), "l");
    assert.equal(normalizeUnit("pcs"), "piece");
    assert.equal(normalizeUnit("bunch"), null);
    assert.equal(itemKey("Tomatoes", null), itemKey("tomato", null));
    assert.equal(itemKey("Apples", null), itemKey("apple", null));
    assert.notEqual(itemKey("onion", "red"), itemKey("onion", null));
  });
});

describe("purchase confirmation", () => {
  const complete = play(customer(said("tomato", "add", { qty: 2, unit: "kg" })), vendor(said("tomato", "price", { rupees: 40, perUnit: "kg" })));

  it("does nothing until the customer confirms: the cart stays active", () => {
    assert.equal(complete.status, "active");
  });

  it("builds a purchase only from a complete cart", () => {
    const purchase = buildPurchase(complete, "p1", "2026-01-01T10:05:00.000Z");
    assert.equal(purchase.status, "confirmed");
    assert.equal(purchase.grandTotalPaise, 8000);
    assert.equal(purchase.items[0].totalPaise, 8000);
    assert.equal(buildPurchase(play(customer(said("onion", "add"))), "p2", AT), null);
    assert.equal(buildPurchase(createCart("empty", AT), "p3", AT), null);
  });

  it("starts a fresh cart after saving without re-adding earlier turns", () => {
    let cart = cartReducer(complete, { type: "new_cart", at: AT, id: "cart-2" });
    assert.equal(cart.items.length, 0);
    cart = cartReducer(cart, { type: "apply_turns", at: AT, turns: [{ id: complete.appliedTurnIds[0], role: "customer", items: [said("tomato", "add", { qty: 2, unit: "kg" })] }] });
    assert.equal(cart.items.length, 0);
  });
});
