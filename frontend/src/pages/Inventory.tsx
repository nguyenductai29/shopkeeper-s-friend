import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Package,
  PackagePlus,
  Search,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { RefreshButton } from "@/components/RefreshButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber, formatVND } from "@/lib/format";
import {
  orderItemsStore,
  ordersStore,
  productsStore,
  purchasesStore,
  type Order,
  type OrderItem,
  type Product,
  type Purchase,
} from "@/lib/fileStore";

const LOW_STOCK_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 8;

type StockStatus = "ok" | "low" | "out";
type SortOrder = "name" | "stock" | "value";
type Activity = {
  id: string;
  type: "Nhập" | "Xuất";
  productName: string;
  productCode: string;
  quantity: number;
  createdAt: string;
  detail: string;
};

function stockStatus(product: Product): StockStatus {
  const stock = Number(product.stock) || 0;
  if (stock <= 0) return "out";
  return stock <= LOW_STOCK_LIMIT ? "low" : "ok";
}

function stockValue(product: Product) {
  return Math.max(0, Number(product.stock) || 0) * Math.max(0, Number(product.cost_price) || 0);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
}

function dateValue(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function formatActivityTime(value: string) {
  const time = dateValue(value);
  if (!time) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

function makeActivity(purchases: Purchase[], orders: Order[], orderItems: OrderItem[]): Activity[] {
  const ordersById = new Map(orders.map((order) => [String(order.id), order]));
  const inbound: Activity[] = purchases.map((purchase) => ({
    id: `purchase-${purchase.id}`,
    type: "Nhập",
    productName: purchase.product_name || "Sản phẩm",
    productCode: purchase.product_code || "",
    quantity: Number(purchase.quantity) || 0,
    createdAt: purchase.created_at,
    detail: `Phiếu nhập #${purchase.id}`,
  }));
  const outbound: Activity[] = orderItems.flatMap((item) => {
    const order = ordersById.get(String(item.order_id));
    if (!order) return [];
    return [{
      id: `order-item-${item.id}`,
      type: "Xuất" as const,
      productName: item.product_name || "Sản phẩm",
      productCode: item.product_code || "",
      quantity: Number(item.quantity) || 0,
      createdAt: order.created_at,
      detail: `Đơn #${order.id}`,
    }];
  });
  return [...inbound, ...outbound]
    .sort((left, right) => dateValue(right.createdAt) - dateValue(left.createdAt))
    .slice(0, RECENT_ACTIVITY_LIMIT);
}

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("name");
  const [status, setStatus] = useState<StockStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyWarning, setHistoryWarning] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productResult, purchaseResult, orderResult, orderItemResult] = await Promise.allSettled([
        productsStore.list(),
        purchasesStore.list(),
        ordersStore.list(),
        orderItemsStore.list(),
      ]);
      if (productResult.status === "rejected") throw productResult.reason;
      setProducts(productResult.value);
      setPurchases(purchaseResult.status === "fulfilled" ? purchaseResult.value : []);
      setOrders(orderResult.status === "fulfilled" ? orderResult.value : []);
      setOrderItems(orderItemResult.status === "fulfilled" ? orderItemResult.value : []);
      const unavailable: string[] = [];
      if (purchaseResult.status === "rejected") unavailable.push("Lịch sử nhập hàng chưa tải được.");
      if (orderResult.status === "rejected" || orderItemResult.status === "rejected") {
        unavailable.push("Lịch sử xuất hàng chưa tải được.");
      }
      setHistoryWarning(unavailable.join(" "));
      setUpdatedAt(new Date());
      setError("");
    } catch {
      setError("Không tải được dữ liệu tồn kho. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics: Array<[string, string, string, LucideIcon]> = useMemo(() => {
    const low = products.filter((product) => stockStatus(product) === "low").length;
    const out = products.filter((product) => stockStatus(product) === "out").length;
    const value = products.reduce((total, product) => total + stockValue(product), 0);
    return [
      ["Tổng mặt hàng", formatNumber(products.length), "Sản phẩm trong hệ thống", Package],
      ["Sắp hết", formatNumber(low), `Còn 1–${LOW_STOCK_LIMIT} sản phẩm`, TriangleAlert],
      ["Hết hàng", formatNumber(out), "Tồn kho bằng 0", TriangleAlert],
      ["Giá trị kho", formatVND(value), "Theo giá nhập", Package],
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const search = normalize(query.trim());
    return products
      .filter((product) => {
        const matchesSearch = !search || normalize(`${product.name} ${product.code}`).includes(search);
        return matchesSearch && (status === "all" || stockStatus(product) === status);
      })
      .sort((left, right) => {
        if (sort === "stock") return Number(left.stock) - Number(right.stock);
        if (sort === "value") return stockValue(right) - stockValue(left);
        return left.name.localeCompare(right.name, "vi", { sensitivity: "base" });
      });
  }, [products, query, sort, status]);

  const activity = useMemo(() => makeActivity(purchases, orders, orderItems), [purchases, orders, orderItems]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-5">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              Kho hàng · {updatedAt ? `cập nhật ${updatedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "dữ liệu hiện tại"}
            </p>
            <h1 className="font-display text-[26px] font-extrabold">Quản lý tồn kho</h1>
          </div>
          <div className="flex gap-2">
            <RefreshButton loading={loading} onClick={() => void load()} />
            <Link
              to="/import"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <PackagePlus className="size-4" />
              Nhập hàng
            </Link>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tổng quan tồn kho">
          {metrics.map(([label, value, caption, Icon], index) => (
            <div key={label} className="rounded-lg border bg-card p-4">
              <div className="flex justify-between gap-2">
                <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
                <Icon className={`size-4 ${index === 1 || index === 2 ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <p className="mt-2 truncate font-display text-2xl font-extrabold" title={value}>{value}</p>
              <p className="text-[10px] text-muted-foreground">{caption}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-wrap gap-2 border-b p-3">
              <label className="flex h-9 min-w-52 flex-1 items-center gap-2 rounded-md border bg-background px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  aria-label="Tìm sản phẩm theo tên hoặc mã"
                  placeholder="Tìm tên hoặc mã sản phẩm…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <Select value={sort} onValueChange={(value) => setSort(value as SortOrder)}>
                <SelectTrigger className="w-40 bg-background" aria-label="Sắp xếp sản phẩm">
                  <SelectValue placeholder="Sắp xếp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Theo tên</SelectItem>
                  <SelectItem value="stock">Tồn ít nhất</SelectItem>
                  <SelectItem value="value">Giá trị cao nhất</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(value) => setStatus(value as StockStatus | "all")}>
                <SelectTrigger className="w-40 bg-background" aria-label="Lọc trạng thái tồn kho">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Mọi trạng thái</SelectItem>
                  <SelectItem value="ok">Còn hàng</SelectItem>
                  <SelectItem value="low">Sắp hết</SelectItem>
                  <SelectItem value="out">Hết hàng</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[12px]">
                <thead className="bg-muted/60 font-mono text-[9px] uppercase text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3">Sản phẩm</th>
                    <th scope="col">Giá nhập</th>
                    <th scope="col">Tồn / ngưỡng</th>
                    <th scope="col">Giá trị</th>
                    <th scope="col">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProducts.map((product) => {
                    const state = stockStatus(product);
                    const stock = Math.max(0, Number(product.stock) || 0);
                    const label = state === "out" ? "Hết hàng" : state === "low" ? "Sắp hết" : "Còn hàng";
                    return (
                      <tr key={product.id} className="hover:bg-muted/40">
                        <td className="p-3">
                          <p className="font-semibold">{product.name}</p>
                          <p className="font-mono text-[9px] text-muted-foreground">{product.code}</p>
                        </td>
                        <td className="font-mono">{formatVND(Number(product.cost_price) || 0)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 shrink-0 rounded bg-muted">
                              <div
                                className={`h-full rounded ${state === "ok" ? "bg-success" : "bg-primary"}`}
                                style={{ width: `${Math.min(100, (stock / (LOW_STOCK_LIMIT * 2)) * 100)}%` }}
                              />
                            </div>
                            <span className="font-mono">{formatNumber(stock)} / {LOW_STOCK_LIMIT}</span>
                          </div>
                        </td>
                        <td className="font-mono">{formatVND(stockValue(product))}</td>
                        <td>
                          <span className={`rounded px-2 py-1 text-[10px] font-semibold ${state === "out" ? "bg-secondary text-secondary-foreground" : state === "low" ? "bg-primary/10 text-primary" : "bg-success/10 text-success"}`}>
                            {label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                        {products.length === 0 ? "Chưa có sản phẩm trong kho." : "Không tìm thấy sản phẩm phù hợp."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t px-3 py-2 font-mono text-[10px] text-muted-foreground">
              Hiển thị {formatNumber(filteredProducts.length)} / {formatNumber(products.length)} mặt hàng
            </div>
          </div>

          <aside className="self-start rounded-lg border bg-card p-4">
            <h2 className="font-display text-[15px] font-bold">Lịch sử nhập xuất</h2>
            <p className="mb-4 font-mono text-[10px] text-muted-foreground">Hoạt động gần nhất</p>
            {historyWarning && (
              <p role="status" className="mb-4 rounded-md bg-primary/10 p-2 text-[11px] text-primary">
                {historyWarning} Đang hiển thị dữ liệu có sẵn.
              </p>
            )}
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {historyWarning ? "Chưa có hoạt động từ dữ liệu đã tải." : "Chưa có hoạt động nhập xuất."}
              </p>
            ) : (
              <div className="space-y-3">
                {activity.map((entry) => (
                  <div key={entry.id} className="flex gap-3 border-b pb-3 last:border-0 last:pb-0">
                    <div className={`grid size-8 shrink-0 place-items-center rounded-md ${entry.type === "Nhập" ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
                      {entry.type === "Nhập" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <p className="truncate text-[12px] font-semibold" title={entry.productName}>
                          {entry.productCode && <span className="font-mono text-muted-foreground">{entry.productCode} · </span>}
                          {entry.productName}
                        </p>
                        <span className={`shrink-0 font-mono text-[11px] font-bold ${entry.type === "Nhập" ? "text-success" : "text-primary"}`}>
                          {entry.type === "Nhập" ? "+" : "−"}{formatNumber(entry.quantity)}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{formatActivityTime(entry.createdAt)} · {entry.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}
