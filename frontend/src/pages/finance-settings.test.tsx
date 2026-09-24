import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminProvider } from "@/contexts/AdminContext";
import Finance from "./Finance";
import Settings from "./Settings";
import Debts from "./Debts";
import Sales from "./Sales";
import Customers from "./Customers";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("Finance currency views", () => {
  it("keeps JPY amounts out of VND totals and switches the visible transactions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "vnd", direction: "IN", amount: "42000", currency: "VND", occurred_at: "2026-09-24", description: "Vietnamese receipt", type: "Sale" },
      { id: "jpy", direction: "IN", amount: "200", currency: "JPY", occurred_at: "2026-09-24", description: "Japanese receipt", type: "Sale" },
    ]))));
    render(<Finance />);
    await screen.findByText("Vietnamese receipt");
    const metric = screen.getByText("Tổng thu").parentElement!.parentElement!;
    expect(within(metric).getByText(/42\.000/)).toBeInTheDocument();
    expect(screen.queryByText("Japanese receipt")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Đơn vị tiền" }), { target: { value: "JPY" } });
    expect(screen.getByText("Japanese receipt")).toBeInTheDocument();
    expect(screen.queryByText("Vietnamese receipt")).not.toBeInTheDocument();
    expect(within(metric).getByText(/200/)).toBeInTheDocument();
  });
});

describe("Debt currency views", () => {
  it("keeps totals and visible debts within the selected currency", async () => {
    sessionStorage.setItem("shop_admin_unlocked", "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "vnd", customer_name: "VND customer", total: "42000", cost_total: "0", currency: "VND", created_at: "2026-09-24" },
      { id: "jpy", customer_name: "JPY customer", total: "200", cost_total: "0", currency: "JPY", created_at: "2026-09-24" },
    ]))));
    render(<AdminProvider><Debts /></AdminProvider>);
    await screen.findByText("VND customer");
    expect(screen.queryByText("JPY customer")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Đơn vị tiền" }), { target: { value: "JPY" } });
    expect(screen.getByText("JPY customer")).toBeInTheDocument();
    expect(screen.queryByText("VND customer")).not.toBeInTheDocument();
  });
});

describe("Settings exchange rate validation", () => {
  it.each(["0", "-1"])("does not save a nonpositive exchange rate (%s)", async (value) => {
    sessionStorage.setItem("shop_admin_unlocked", "1");
    let writes = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") writes += 1;
      return new Response(JSON.stringify({ id: 1, shop_name: "Shop", currency: "VND", jpy_to_vnd_rate: 170 }));
    }));
    render(<AdminProvider><Settings /></AdminProvider>);
    const input = await screen.findByRole("spinbutton");
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu cài đặt" })).toBeEnabled());
    expect(writes).toBe(0);
    expect(input).toHaveValue(Number(value));
  });
});

describe("Historical order and customer currencies", () => {
  it("filters Sales orders and details to the selected currency", async () => {
    sessionStorage.setItem("shop_admin_unlocked", "1");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url === "/api/orders" ? [
      { id: "vnd", customer_name: "VND customer", total: "42000", cost_total: "0", currency: "VND", created_at: "2026-09-24" },
      { id: "jpy", customer_name: "JPY customer", total: "200", cost_total: "0", currency: "JPY", created_at: "2026-09-24" },
    ] : []))));
    render(<AdminProvider><Sales /></AdminProvider>);
    await screen.findAllByText("VND customer");
    expect(screen.queryAllByText("JPY customer")).toHaveLength(0);
    fireEvent.change(screen.getByRole("combobox", { name: "Đơn vị tiền" }), { target: { value: "JPY" } });
    await screen.findAllByText("JPY customer");
    expect(screen.queryAllByText("VND customer")).toHaveLength(0);
  });

  it("requests customer revenue in the selected currency and retains search text", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const query = new URL(url, "http://test").searchParams;
      return new Response(JSON.stringify([{ id: "customer", customer_code: "KH1", name: `${query.get("currency")} ${query.get("q") || "result"}`, order_count: 1, lifetime_revenue: 200 }]));
    }));
    render(<Customers />);
    await screen.findByText("VND result");
    fireEvent.change(screen.getByPlaceholderText("Tìm tên hoặc số điện thoại"), { target: { value: "filter" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Đơn vị tiền" }), { target: { value: "JPY" } });
    await screen.findByText("JPY filter");
    expect(screen.queryByText("VND result")).not.toBeInTheDocument();
  });
});
