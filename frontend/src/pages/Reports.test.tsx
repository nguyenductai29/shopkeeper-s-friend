import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/format";
import Reports from "./Reports";

vi.mock("@/components/AdminGate", () => ({ AdminGate: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <svg>{children}</svg>,
  Area: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps revenue metrics and order details within the selected currency", async () => {
  const orders = [
    { id: "vnd-order", currency: "VND", customer_name: "Khách VND", total: 200000, cost_total: 100000 },
    { id: "jpy-order", currency: "JPY", customer_name: "Khách JPY", total: 2000, cost_total: 1000 },
  ].map(order => ({ ...order, paid: true, discount: 0, created_at: new Date().toISOString() }));
  const items = orders.map((order, index) => ({ id: index + 1, order_id: order.id, product_code: order.id, product_name: `Hàng ${order.currency}`, quantity: 1, cost_price: order.cost_total, sale_price: order.total, subtotal: order.total }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path !== "/api/orders" && path !== "/api/order-items") throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(path === "/api/orders" ? orders : items), { status: 200 });
  }));

  render(<Reports />);
  const metrics = screen.getByLabelText("Chỉ số doanh thu");
  expect(await within(metrics).findAllByText(formatCurrency(200000, "VND"), { normalizer: value => value })).toHaveLength(2);
  fireEvent.keyDown(screen.getByRole("tab", { name: "Chi tiết doanh thu" }), { key: "Enter" });
  expect(await screen.findByText("Khách VND")).toBeInTheDocument();
  expect(screen.queryByText("Khách JPY")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Đơn vị tiền báo cáo"), { target: { value: "JPY" } });
  expect(await within(metrics).findAllByText(formatCurrency(2000, "JPY"), { normalizer: value => value })).toHaveLength(2);
  expect(screen.getByText("Khách JPY")).toBeInTheDocument();
  expect(screen.getByText("Hàng JPY")).toBeInTheDocument();
  expect(screen.queryByText("Khách VND")).not.toBeInTheDocument();
  expect(screen.queryByText("Hàng VND")).not.toBeInTheDocument();
});
