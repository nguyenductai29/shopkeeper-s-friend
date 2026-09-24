import { describe, expect, it } from "vitest";

import { buildSalesReport, csvCell } from "./reporting";
import type { Order, OrderItem } from "./localStore";

const order = (id: number, date: string, total: number, cost: number, paid: boolean): Order => ({
  id,
  customer_name: `Khách ${id}`,
  customer_phone: null,
  customer_address: null,
  total,
  cost_total: cost,
  discount: 0,
  paid,
  note: null,
  created_at: date,
});

const item = (orderId: number, code: string): OrderItem => ({
  id: orderId,
  order_id: orderId,
  product_id: orderId,
  product_code: code,
  product_name: code,
  image_url: null,
  cost_price: 10,
  sale_price: 20,
  quantity: 1,
  subtotal: 20,
});

describe("buildSalesReport", () => {
  const now = new Date(2026, 8, 24, 12);
  const orders = [
    order(1, new Date(2026, 8, 24, 9).toISOString(), 120, 70, true),
    order(2, new Date(2026, 8, 23, 14).toISOString(), 80, 30, false),
    order(3, new Date(2026, 7, 31, 14).toISOString(), 50, 20, true),
  ];
  const items = [item(1, "A"), item(2, "B"), item(3, "A")];

  it("uses real order totals and costs, and places recent sales in daily buckets", () => {
    const report = buildSalesReport(orders, items, "day", "all", "all", now);

    expect(report.orders).toHaveLength(2);
    expect(report.total).toBe(200);
    expect(report.grossProfit).toBe(100);
    expect(report.average).toBe(100);
    expect(report.points).toHaveLength(7);
    expect(report.points.at(-1)?.revenue).toBe(120);
    expect(report.points.at(-2)?.revenue).toBe(80);
  });

  it("filters payment state and products before computing totals", () => {
    const report = buildSalesReport(orders, items, "month", "paid", "A", now);

    expect(report.orders.map((value) => value.id)).toEqual([1, 3]);
    expect(report.total).toBe(170);
    expect(report.grossProfit).toBe(80);
    expect(report.points.at(-1)?.revenue).toBe(120);
    expect(report.points.at(-2)?.revenue).toBe(50);
  });

  it("returns zero average and a complete chart for an empty result", () => {
    const report = buildSalesReport([], [], "week", "all", "all", now);

    expect(report.average).toBe(0);
    expect(report.points).toHaveLength(5);
    expect(report.points.every((point) => point.revenue === 0)).toBe(true);
  });

  it("attributes a discounted mixed order only to the selected product", () => {
    const mixedOrder = order(4, new Date(2026, 8, 24, 10).toISOString(), 150, 90, true);
    const mixedItems: OrderItem[] = [
      { ...item(4, "A"), id: 41, subtotal: 100, sale_price: 100, cost_price: 40 },
      { ...item(4, "B"), id: 42, subtotal: 100, sale_price: 100, cost_price: 50 },
    ];

    const report = buildSalesReport([mixedOrder], mixedItems, "day", "all", "A", now);

    expect(report.total).toBe(75);
    expect(report.grossProfit).toBe(35);
    expect(report.rows[0].items.map((value) => value.product_code)).toEqual(["A"]);
    expect(report.rows[0].revenue).toBe(75);
  });
});

describe("csvCell", () => {
  it("neutralizes spreadsheet formulas in imported customer or product names", () => {
    expect(csvCell(" =HYPERLINK(\"https://example.com\")")).toBe('"\' =HYPERLINK(""https://example.com"")"');
    expect(csvCell("+SUM(1,1)")).toBe('"\'+SUM(1,1)"');
    expect(csvCell(120)).toBe('"120"');
  });
});
