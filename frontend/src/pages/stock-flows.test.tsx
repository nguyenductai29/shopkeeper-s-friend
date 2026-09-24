import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { Product } from "@/lib/fileStore";
import { productPricesInVnd } from "@/lib/currency";
import POS from "./POS";
import ImportPage from "./Import";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/AdminGate", () => ({
  AdminGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const product: Product & { barcode: string } = {
  id: 17,
  code: "POS-001",
  barcode: "4901234567890",
  name: "Sữa kiểm thử",
  image_url: null,
  cost_price: 5000,
  sale_price: 20000,
  stock: 8,
  created_at: "2026-09-24T01:00:00Z",
  updated_at: "2026-09-24T01:00:00Z",
};
const otherProduct = { ...product, id: 18, code: "POS-002", barcode: "4901234567000", name: "Trà kiểm thử" };
type RequestRecord = { path: string; method: string; body: Record<string, unknown> | null };
let requests: RequestRecord[];
let listedProducts: Array<Product & { barcode: string }>;
let productStatus: number;
let orderStatus: number;

beforeEach(() => {
  requests = [];
  listedProducts = [product, otherProduct];
  productStatus = 200;
  orderStatus = 200;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const path = String(input);
    const method = options?.method || "GET";
    const body = typeof options?.body === "string" ? JSON.parse(options.body) as Record<string, unknown> : null;
    requests.push({ path, method, body });
    let value: unknown;
    let status = 200;
    if (path === "/api/products" && method === "GET") {
      value = listedProducts;
      status = productStatus;
    } else if (path === "/api/settings" && method === "GET") {
      value = { jpy_to_vnd_rate: 170 };
    } else if (path === "/api/orders" && method === "POST") {
      value = { id: 91, ...body, created_at: product.created_at };
      status = orderStatus;
    } else if (path === "/api/products/upsert" && method === "POST") {
      value = { ...product, ...body };
    } else if (path === "/api/purchases") {
      value = method === "GET" ? [] : { id: 92, ...body, created_at: product.created_at };
    } else if (path === "/api/order-items/bulk") {
      value = [];
    } else if (path.endsWith("/stock") && method === "PATCH") {
      value = {};
    } else {
      throw new Error(`Unexpected mocked API request: ${method} ${path}`);
    }
    return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function addProductToCart(quantity = 1) {
  const productButton = await screen.findByRole("button", { name: /POS-001.*Sữa kiểm thử/ });
  for (let index = 0; index < quantity; index += 1) fireEvent.click(productButton);
  fireEvent.click(screen.getByRole("button", { name: /Giỏ hàng \(/ }));
}

async function confirmCheckout() {
  fireEvent.click(screen.getByRole("button", { name: /^Thanh toán / }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
}

describe("POS inventory requests", () => {
  it("submits the order and its items together without a second stock mutation", async () => {
    render(<POS />);
    await addProductToCart(2);
    fireEvent.click(screen.getByText("Thông tin khách hàng (tuỳ chọn)"));
    fireEvent.change(screen.getByLabelText("Tên khách"), { target: { value: "Khách kiểm thử" } });
    fireEvent.change(screen.getByLabelText("Số điện thoại"), { target: { value: "0901234567" } });
    fireEvent.change(screen.getByLabelText("Địa chỉ"), { target: { value: "12 Phố Mới" } });
    fireEvent.change(screen.getByLabelText("Giảm giá"), { target: { value: "5,000" } });
    await confirmCheckout();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Đã tạo đơn hàng"));

    const mutations = requests.filter(request => request.method !== "GET");
    expect(mutations.map(request => `${request.method} ${request.path}`)).toEqual(["POST /api/orders"]);
    expect(mutations[0].body).toMatchObject({
      customer_name: "Khách kiểm thử",
      customer_phone: "0901234567",
      customer_address: "12 Phố Mới",
      total: 35000,
      cost_total: 10000,
      discount: 5000,
      paid: true,
      items: [{ product_id: 17, product_code: "POS-001", product_name: product.name, quantity: 2, cost_price: 5000, sale_price: 20000, subtotal: 40000 }],
    });
    expect(screen.queryByRole("button", { name: `Xóa ${product.name}` })).not.toBeInTheDocument();
  });

  it("adds the matching barcode when the stored product code is different", async () => {
    render(<POS />);
    await screen.findByRole("button", { name: /POS-001.*Sữa kiểm thử/ });
    const scanner = screen.getByPlaceholderText("Quét mã hoặc tìm tên sản phẩm…");
    fireEvent.change(scanner, { target: { value: product.barcode } });
    fireEvent.submit(scanner.closest("form")!);

    expect(await screen.findByRole("button", { name: `Xóa ${product.name}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Xóa ${otherProduct.name}` })).not.toBeInTheDocument();
    expect(scanner).toHaveValue("");
    expect(toast.error).not.toHaveBeenCalled();
    expect(requests.every(request => request.method === "GET")).toBe(true);
  });

  it("converts JPY prices at the configured rate only in the order snapshot", async () => {
    listedProducts = [{ ...product, currency: "JPY", cost_price: 100, sale_price: 200 }, otherProduct];
    render(<POS />);
    await addProductToCart();
    await confirmCheckout();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Đã tạo đơn hàng"));

    const mutations = requests.filter(request => request.method !== "GET");
    expect(mutations.map(request => `${request.method} ${request.path}`)).toEqual(["POST /api/orders"]);
    expect(mutations[0].body).toMatchObject({
      total: 34000,
      cost_total: 17000,
      currency: "VND",
      items: [{ product_id: 17, cost_price: 17000, sale_price: 34000, quantity: 1, subtotal: 34000 }],
    });
    expect(listedProducts[0]).toMatchObject({ currency: "JPY", cost_price: 100, sale_price: 200 });
  });

  it("reports product-load errors and recovers on refresh without an unhandled rejection", async () => {
    productStatus = 503;
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    try {
      render(<POS />);
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: "Làm mới" })).toBeEnabled();
      productStatus = 200;
      fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
      expect(await screen.findByRole("button", { name: /POS-001.*Sữa kiểm thử/ })).toBeInTheDocument();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("unhandledrejection", unhandled);
    }
  });

  it("keeps the cart when atomic checkout fails and sends no follow-up stock requests", async () => {
    orderStatus = 409;
    render(<POS />);
    await addProductToCart();
    await confirmCheckout();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: `Xóa ${product.name}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Thanh toán / })).toBeEnabled();
    expect(requests.filter(request => request.method !== "GET").map(request => request.path)).toEqual(["/api/orders"]);
    expect(toast.success).not.toHaveBeenCalledWith("Đã tạo đơn hàng");
  });
});

describe("Import inventory requests", () => {
  it("saves product metadata without incrementing stock before recording the purchase quantity", async () => {
    render(<ImportPage />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm tay" }));
    const name = screen.getByPlaceholderText("Tên sản phẩm");
    const row = name.closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    fireEvent.change(within(cells[1]).getByRole("textbox"), { target: { value: "IMPORT-001" } });
    fireEvent.change(name, { target: { value: "Hàng nhập kiểm thử" } });
    fireEvent.change(within(cells[3]).getByRole("textbox"), { target: { value: "5,000" } });
    fireEvent.change(within(cells[4]).getByRole("textbox"), { target: { value: "20,000" } });
    fireEvent.change(within(row).getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu nhập kho" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Đã nhập 1 mặt hàng"));

    const mutations = requests.filter(request => request.method !== "GET");
    expect(mutations.map(request => request.path)).toEqual(["/api/products/upsert", "/api/purchases"]);
    expect(mutations[0].body).toMatchObject({ code: "IMPORT-001", name: "Hàng nhập kiểm thử", stock: 0, addStock: 0 });
    expect(mutations[1].body).toMatchObject({ product_id: 17, product_code: "IMPORT-001", quantity: 3, cost_price: 5000, sale_price: 20000, total: 15000 });
    expect(screen.queryByPlaceholderText("Tên sản phẩm")).not.toBeInTheDocument();
  });
});

describe("JPY price conversion validation", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects rate %s before JPY products can be sold", (rate) => {
    expect(() => productPricesInVnd({ ...product, currency: "JPY" }, rate)).toThrow(/tỷ giá/);
  });

  it("leaves VND prices unchanged when a JPY rate is not configured", () => {
    expect(productPricesInVnd({ ...product, currency: "VND" }, Number.NaN)).toMatchObject({ cost_price: 5000, sale_price: 20000, currency: "VND" });
  });
});
