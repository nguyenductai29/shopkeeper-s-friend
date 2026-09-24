import { afterEach, describe, expect, it, vi } from "vitest";
import { orderItemsStore, ordersStore, productsStore, purchasesStore } from "./fileStore";

const uuid = "c4cd4930-38f5-4e5a-a42f-38e7c1ed2c9c";

function respond(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })));
}

afterEach(() => vi.unstubAllGlobals());

describe("API record normalization", () => {
  it("reads purchase costs from PostgreSQL unit_cost without changing currency or UUIDs", async () => {
    respond([{ id: uuid, product_id: uuid, currency: "JPY", unit_cost: "123.50", sale_price: "200", quantity: "2", total: "247" }]);
    expect(await purchasesStore.list()).toEqual([expect.objectContaining({
      id: uuid, product_id: uuid, currency: "JPY", cost_price: 123.5, sale_price: 200, quantity: 2, total: 247,
    })]);
  });

  it("keeps original product currency and price while normalizing numeric strings", async () => {
    respond([{ id: uuid, code: "4900000000001", barcode: "4900000000001", currency: "JPY", cost_price: "250", sale_price: "350", stock: "7" }]);
    expect(await productsStore.list()).toEqual([expect.objectContaining({
      id: uuid, code: "4900000000001", barcode: "4900000000001", currency: "JPY", cost_price: 250, sale_price: 350, stock: 7,
    })]);
  });

  it("normalizes order totals and discounts before calculations", async () => {
    respond([{ id: uuid, currency: "VND", total: "120000", cost_total: "85000", discount: "5000", paid: false }]);
    expect(await ordersStore.list()).toEqual([expect.objectContaining({
      id: uuid, currency: "VND", total: 120000, cost_total: 85000, discount: 5000, paid: false,
    })]);
  });

  it("maps order item unit_price and line_total and preserves explicit zero values", async () => {
    respond([
      { id: uuid, order_id: uuid, quantity: "2", cost_price: "15", unit_price: "20", line_total: "40" },
      { id: 2, order_id: uuid, quantity: "1", cost_price: "0", sale_price: "0", unit_price: "99", subtotal: "0", line_total: "99" },
    ]);
    expect(await orderItemsStore.forOrder(uuid)).toEqual([
      expect.objectContaining({ id: uuid, order_id: uuid, quantity: 2, cost_price: 15, sale_price: 20, subtotal: 40 }),
      expect.objectContaining({ quantity: 1, cost_price: 0, sale_price: 0, subtotal: 0 }),
    ]);
  });

  it("rejects malformed collection responses instead of returning an error object as rows", async () => {
    respond({ error: "upstream unavailable" });
    await expect(ordersStore.list()).rejects.toThrow();
  });

  it("rejects invalid monetary data instead of displaying a fabricated zero", async () => {
    respond([{ id: uuid, total: "invalid", cost_total: "12", discount: "0" }]);
    await expect(ordersStore.list()).rejects.toThrow();
  });
});

describe("API failures and writes", () => {
  it("surfaces a structured API error to the caller", async () => {
    respond({ error: "Insufficient stock" }, 409);
    await expect(ordersStore.list()).rejects.toThrow("Insufficient stock");
  });

  it("uses status context for non-JSON failures without exposing HTML", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Private proxy diagnostics</html>", { status: 502 })));
    await expect(ordersStore.list()).rejects.toThrow(/502/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Private proxy diagnostics</html>", { status: 502 })));
    await expect(ordersStore.list()).rejects.not.toThrow(/Private proxy diagnostics/);
  });

  it("accepts a successful empty mutation response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(ordersStore.setPaid(uuid, true)).resolves.toBeUndefined();
  });

  it("submits the order and its items in one request with UUIDs intact", async () => {
    const input = {
      customer_name: null, customer_phone: null, customer_address: null, total: 20, cost_total: 10,
      discount: 0, paid: true, note: null, currency: "VND",
      items: [{ product_id: uuid, product_code: "ABC", product_name: "Product", image_url: null, cost_price: 10, sale_price: 20, quantity: 1, subtotal: 20 }],
    };
    let submitted: unknown;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      submitted = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ ...input, id: uuid, created_at: "2026-09-24T00:00:00.000Z" }));
    }));
    const order = await ordersStore.create(input);
    expect(submitted).toEqual(input);
    expect(order.id).toBe(uuid);
  });
});
