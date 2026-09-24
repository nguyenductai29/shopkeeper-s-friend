import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  HandCoins,
  Package,
  ReceiptText,
  Search,
  TrendingUp,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { ProductImage } from "@/components/ProductImage";
import { RefreshButton } from "@/components/RefreshButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportRowsToExcel } from "@/lib/exportExcel";
import { formatCurrency, formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  invoiceTemplatesStore,
  orderItemsStore,
  ordersStore,
  paymentQrsStore,
  type EntityId,
  type InvoiceTemplate,
  type Order,
  type OrderItem,
  type PaymentQr,
} from "@/lib/fileStore";
import { buildVietQrImageUrl, formatVietQrAddInfo, invoiceQrAmount } from "@/lib/vietqr";

type SortKey = "id" | "created_at" | "customer_name" | "total" | "cost_total" | "discount" | "profit" | "paid";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 12;

function formatDateTime(value: string) {
  return format(new Date(value), "dd/MM/yyyy HH:mm");
}

function profit(order: Order) {
  return Number(order.total || 0) - Number(order.cost_total || 0);
}

function orderDiscount(order: Order) {
  return Number(order.discount || 0);
}

function orderSubtotal(order: Order, items: OrderItem[]) {
  const itemSubtotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  return itemSubtotal > 0 ? itemSubtotal : Number(order.total || 0) + orderDiscount(order);
}

function compareValues(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "vi", { numeric: true, sensitivity: "base" });
}

function MetricTile({
  label,
  value,
  icon: Icon,
  index,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  index: number;
  valueClassName?: string;
}) {
  return (
    <div
      className="animate-rise rounded-lg border bg-card p-3 backdrop-blur-md"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
        <Icon className="size-4 shrink-0 text-primary" />
      </div>
      <p className={cn("mt-1.5 font-display text-xl font-extrabold", valueClassName)}>{value}</p>
    </div>
  );
}

function Inner() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [paymentQrs, setPaymentQrs] = useState<PaymentQr[]>([]);
  const [selectedId, setSelectedId] = useState<EntityId | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<EntityId | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "created_at",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [mobilePanel, setMobilePanel] = useState<"orders" | "detail">("orders");
  const [currency, setCurrency] = useState("VND");

  const loadOrders = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      const [list, templateList, qrList] = await Promise.all([
        ordersStore.list(),
        invoiceTemplatesStore.list(),
        paymentQrsStore.list(),
      ]);
      setOrders(list);
      setTemplates(templateList);
      setPaymentQrs(qrList);
      setItems({});
      setItemErrors({});
      setSelectedId((current) => (list.some((order) => order.id === current) ? current : list[0]?.id ?? null));
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tải được đơn hàng";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (showLoading) setRefreshing(false);
    }
  };

  useEffect(() => { loadOrders(); }, []);

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? null;
  const selectedItems = selectedId ? items[String(selectedId)] || [] : [];
  const invoiceOrder = orders.find((order) => order.id === invoiceOrderId) ?? null;
  const invoiceItems = invoiceOrderId ? items[String(invoiceOrderId)] || [] : [];
  const invoiceTemplate = templates.find((template) => template.is_default) || templates[0] || null;
  const invoicePaymentQr = invoiceTemplate?.payment_qr_id
    ? paymentQrs.find((qr) => qr.id === invoiceTemplate.payment_qr_id) || null
    : null;

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const currencyOrders = orders.filter((order) => (order.currency || "VND").toUpperCase() === currency);
    const rows = keyword
      ? currencyOrders.filter((order) => (
          String(order.id).includes(keyword)
          || String(order.customer_name || "khách lẻ").toLowerCase().includes(keyword)
          || String(order.customer_phone || "").toLowerCase().includes(keyword)
          || String(order.customer_address || "").toLowerCase().includes(keyword)
        ))
      : currencyOrders;

    return [...rows].sort((a, b) => {
      const aValue = sort.key === "profit" ? profit(a) : a[sort.key];
      const bValue = sort.key === "profit" ? profit(b) : b[sort.key];
      const result = compareValues(aValue, bValue);
      return sort.direction === "asc" ? result : -result;
    });
  }, [orders, search, sort, currency]);

  useEffect(() => {
    if (!filteredOrders.some((order) => order.id === selectedId)) {
      setSelectedId(filteredOrders[0]?.id ?? null);
    }
  }, [filteredOrders, selectedId]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleOrders = filteredOrders.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const stats = useMemo(() => ({
    orders: filteredOrders.length,
    revenue: filteredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    profit: filteredOrders.reduce((sum, order) => sum + profit(order), 0),
    unpaid: filteredOrders.filter((order) => !order.paid).length,
  }), [filteredOrders]);

  const handleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  };

  const SortableHead = ({
    sortKey,
    className = "",
    children,
  }: {
    sortKey: SortKey;
    className?: string;
    children: ReactNode;
  }) => {
    const Icon = sort.key === sortKey ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={cn("px-3 py-2.5", className)}>
        <button
          type="button"
          onClick={() => handleSort(sortKey)}
          className={cn(
            "flex w-full items-center gap-1 uppercase transition-colors hover:text-foreground",
            className.includes("text-right") ? "justify-end text-right" : "text-left",
            sort.key === sortKey && "text-foreground",
          )}
        >
          <span>{children}</span>
          <Icon className="size-3 shrink-0" />
        </button>
      </th>
    );
  };

  const retryOrderItems = (id: EntityId) => {
    setItemErrors((current) => {
      const next = { ...current };
      delete next[String(id)];
      return next;
    });
  };

  const openOrder = (id: EntityId) => {
    setSelectedId(id);
    setMobilePanel("detail");
    retryOrderItems(id);
  };

  const openInvoice = (id: EntityId) => {
    openOrder(id);
    setInvoiceOrderId(id);
  };

  useEffect(() => {
    if (!selectedId || items[String(selectedId)] || itemErrors[String(selectedId)]) return;
    let active = true;
    orderItemsStore.forOrder(selectedId).then((orderItems) => {
      if (active) setItems((current) => ({ ...current, [String(selectedId)]: orderItems }));
    }).catch((error: unknown) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : "Không tải được chi tiết đơn hàng";
      setItemErrors((current) => ({ ...current, [String(selectedId)]: message }));
      toast.error(message);
    });
    return () => { active = false; };
  }, [selectedId, items, itemErrors]);

  const markPaid = async (order: Order) => {
    try {
      await ordersStore.setPaid(order.id, true);
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, paid: true } : item));
      toast.success("Đã đánh dấu đã thanh toán");
      await loadOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không cập nhật được thanh toán");
    }
  };

  const exportSales = () => {
    if (filteredOrders.length === 0) return toast.error("Không có dữ liệu bán hàng để xuất");
    exportRowsToExcel({
      filename: `ban-hang-${format(new Date(), "yyyyMMdd-HHmm")}.xls`,
      sheetName: "Ban hang",
      rows: filteredOrders,
      columns: [
        { header: "ID", value: "id" },
        { header: "Thời gian", value: (row) => formatDateTime(row.created_at) },
        { header: "Khách hàng", value: (row) => row.customer_name || "Khách lẻ" },
        { header: "SĐT", value: (row) => row.customer_phone || "" },
        { header: "Địa chỉ", value: (row) => row.customer_address || "" },
        { header: "Giảm giá", value: (row) => orderDiscount(row) },
        { header: "Doanh thu", value: (row) => Number(row.total) },
        { header: "Đơn vị tiền", value: (row) => row.currency || "VND" },
        { header: "Giá vốn", value: (row) => Number(row.cost_total) },
        { header: "Lợi nhuận", value: (row) => profit(row) },
        { header: "Thanh toán", value: (row) => (row.paid ? "Đã thanh toán" : "Chưa thanh toán") },
      ],
    });
  };

  const rangeStart = filteredOrders.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + visibleOrders.length, filteredOrders.length);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden p-4 sm:p-5 [@media(max-height:600px)]:gap-2 [@media(max-height:600px)]:p-3">
      <div className="flex shrink-0 animate-rise flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">
            Quản lý bán hàng · Theo dõi đơn hàng, doanh thu và trạng thái thanh toán
          </p>
          <h1 className="font-display text-[26px] font-extrabold">Đơn hàng</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshButton loading={refreshing} onClick={() => loadOrders(true)} />
          <Button variant="outline" onClick={exportSales} disabled={filteredOrders.length === 0}>
            <FileSpreadsheet /> Xuất Excel
          </Button>
        </div>
      </div>

      {loadError && <div role="alert" className="flex shrink-0 items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><span>{loadError}</span><Button size="sm" variant="outline" onClick={() => loadOrders(true)}>Thử lại</Button></div>}
      {!(loadError && orders.length === 0) && <section className="grid shrink-0 auto-cols-[minmax(8rem,1fr)] grid-flow-col gap-3 overflow-x-auto">
        <MetricTile index={0} label="Số đơn" icon={ReceiptText} value={stats.orders} />
        <MetricTile
          index={1}
          label="Doanh thu"
          icon={TrendingUp}
          value={formatCurrency(stats.revenue, currency)}
          valueClassName="text-primary"
        />
        <MetricTile index={2} label="Lợi nhuận" icon={WalletCards} value={formatCurrency(stats.profit, currency)} />
        <MetricTile
          index={3}
          label="Chưa thanh toán"
          icon={HandCoins}
          value={stats.unpaid}
          valueClassName="text-destructive"
        />
      </section>}

      <div className="flex shrink-0 gap-2 lg:hidden">
        <Button size="sm" variant={mobilePanel === "orders" ? "default" : "outline"} aria-pressed={mobilePanel === "orders"} onClick={() => setMobilePanel("orders")}>Đơn hàng</Button>
        <Button size="sm" variant={mobilePanel === "detail" ? "default" : "outline"} aria-pressed={mobilePanel === "detail"} onClick={() => setMobilePanel("detail")}>Chi tiết đơn</Button>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card backdrop-blur-md", mobilePanel !== "orders" && "hidden lg:flex")}>
          <div className="flex shrink-0 flex-wrap gap-2 border-b p-3">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-1 focus-within:ring-ring">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Tìm theo mã đơn, khách hàng, SĐT hoặc địa chỉ..."
              />
            </label>
            <select aria-label="Đơn vị tiền" value={currency} onChange={(event) => { setCurrency(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="VND">VND</option><option value="JPY">JPY</option></select>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1040px] text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-muted font-mono text-[9px] uppercase text-muted-foreground">
                <tr>
                  <SortableHead sortKey="id" className="w-20">ID</SortableHead>
                  <SortableHead sortKey="created_at" className="w-40">Thời gian</SortableHead>
                  <SortableHead sortKey="customer_name">Khách hàng</SortableHead>
                  <SortableHead sortKey="discount" className="w-32 text-right">Giảm giá</SortableHead>
                  <SortableHead sortKey="total" className="w-36 text-right">Doanh thu</SortableHead>
                  <SortableHead sortKey="cost_total" className="w-32 text-right">Giá vốn</SortableHead>
                  <SortableHead sortKey="profit" className="w-32 text-right">Lãi</SortableHead>
                  <SortableHead sortKey="paid" className="w-32">Trạng thái</SortableHead>
                  <th className="w-24 px-3 py-2.5 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!loadError && visibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-3">
                      <div className="grid h-56 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
                        <div>
                          <ReceiptText className="mx-auto mb-2 size-7" />
                          <p className="text-sm">Chưa có đơn hàng.</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {visibleOrders.map((order) => (
                  <tr
                    key={order.id}
                    data-state={selectedId === order.id ? "selected" : undefined}
                    className="cursor-pointer transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary/8"
                    onClick={() => openOrder(order.id)}
                  >
                    <td className="px-3 py-2.5 font-mono font-semibold">#{order.id}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono">{formatDateTime(order.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold">{order.customer_name || "Khách lẻ"}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">{order.customer_phone || ""}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">{formatCurrency(orderDiscount(order), order.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold">{formatCurrency(order.total, order.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">{formatCurrency(order.cost_total, order.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">{formatCurrency(profit(order), order.currency)}</td>
                    <td className="px-3 py-2.5">
                      {order.paid ? (
                        <span className="whitespace-nowrap rounded bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">
                          Đã TT
                        </span>
                      ) : (
                        <span className="whitespace-nowrap rounded bg-destructive/10 px-2 py-1 text-[10px] font-semibold text-destructive">
                          Chưa TT
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          openInvoice(order.id);
                        }}
                        title="Xem hoá đơn"
                      >
                        <Eye />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
            <div className="font-mono text-[10px] text-muted-foreground">
              Hiển thị {rangeStart}-{rangeEnd} / {filteredOrders.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft />
              </Button>
              <div className="min-w-24 text-center font-mono text-[11px]">
                Trang {currentPage} / {totalPages}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>

        <aside className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card backdrop-blur-md", mobilePanel !== "detail" && "hidden lg:flex")}>
          <div className="shrink-0 border-b p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-[15px] font-bold">
                  {selectedOrder ? `Đơn #${selectedOrder.id}` : "Chi tiết đơn"}
                </h2>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {selectedOrder ? formatDateTime(selectedOrder.created_at) : "Chọn một đơn để xem"}
                </p>
              </div>
              {selectedOrder && !selectedOrder.paid && (
                <Button size="sm" onClick={() => markPaid(selectedOrder)}>
                  <Check /> Đã TT
                </Button>
              )}
            </div>
          </div>

          {!selectedOrder ? (
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="grid h-full min-h-40 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
                <div>
                  <ReceiptText className="mx-auto mb-2 size-7" />
                  <p className="text-sm">Chưa chọn đơn hàng</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="flex shrink-0 gap-3 border-b px-4 py-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/35 text-accent-foreground">
                  <UserRound className="size-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-[13px] font-semibold">{selectedOrder.customer_name || "Khách lẻ"}</p>
                  {selectedOrder.customer_phone && <p className="font-mono text-[11px] text-muted-foreground">{selectedOrder.customer_phone}</p>}
                  {selectedOrder.customer_address && <p className="text-[11px] text-muted-foreground">{selectedOrder.customer_address}</p>}
                </div>
              </div>

              <div className="space-y-3 p-4">
                {itemErrors[String(selectedOrder.id)] && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{itemErrors[String(selectedOrder.id)]}</p><Button size="sm" variant="outline" onClick={() => retryOrderItems(selectedOrder.id)}>Thử lại</Button></div>}
                {!itemErrors[String(selectedOrder.id)] && selectedItems.length === 0 && (
                  <div className="grid h-40 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
                    <div>
                      <Package className="mx-auto mb-2 size-7" />
                      <p className="text-sm">Chưa tải chi tiết</p>
                    </div>
                  </div>
                )}
                {selectedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 border-b pb-3 last:border-0 last:pb-0">
                    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-background">
                      <ProductImage src={item.image_url} alt={item.product_name} className="size-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold">{item.product_name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{item.product_code} x {item.quantity}</p>
                    </div>
                    <span className="shrink-0 text-right font-mono text-[12px] font-bold">{formatCurrency(item.subtotal, selectedOrder.currency)}</span>
                  </div>
                ))}
              </div>

              <div className="shrink-0 space-y-2 border-t p-4">
                {orderDiscount(selectedOrder) > 0 && (
                  <>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-muted-foreground">Tạm tính</span><span className="font-mono">{formatCurrency(orderSubtotal(selectedOrder, selectedItems), selectedOrder.currency)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-muted-foreground">Giảm giá</span><span className="font-mono">-{formatCurrency(orderDiscount(selectedOrder), selectedOrder.currency)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Giá vốn</span><span className="font-mono">{formatCurrency(selectedOrder.cost_total, selectedOrder.currency)}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Lợi nhuận</span><span className="font-mono">{formatCurrency(profit(selectedOrder), selectedOrder.currency)}</span>
                </div>
                <div className="flex items-end justify-between border-t pt-3">
                  <span className="font-semibold">Tổng tiền</span><span className="font-display text-2xl font-extrabold text-primary">{formatCurrency(selectedOrder.total, selectedOrder.currency)}</span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      <Dialog open={!!invoiceOrderId} onOpenChange={(open) => !open && setInvoiceOrderId(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-display">{invoiceOrder ? `Hoá đơn #${invoiceOrder.id}` : "Hoá đơn"}</DialogTitle>
          </DialogHeader>
          {invoiceOrder && (
            <div className="min-h-0 overflow-auto rounded-md border bg-white p-5 font-mono text-sm text-black shadow-sm">
              {itemErrors[String(invoiceOrder.id)] && <div role="alert" className="mb-3 space-y-2 text-sm text-destructive"><p>{itemErrors[String(invoiceOrder.id)]}</p><Button size="sm" variant="outline" onClick={() => retryOrderItems(invoiceOrder.id)}>Thử lại</Button></div>}
              <div className="text-center">
                <div className="text-lg font-bold">{invoiceTemplate?.shop_name || "ShopFlow"}</div>
                {invoiceTemplate?.shop_address && <div className="text-xs">{invoiceTemplate.shop_address}</div>}
                {invoiceTemplate?.shop_phone && <div className="text-xs">SĐT: {invoiceTemplate.shop_phone}</div>}
              </div>
              <div className="my-3 border-t border-dashed border-black/60" />
              <div className="text-center font-semibold">HOÁ ĐƠN BÁN HÀNG</div>
              <div className="mt-1 text-center text-xs">{formatDateTime(invoiceOrder.created_at)}</div>
              {invoiceTemplate?.header_note && (
                <div className="mt-2 text-xs italic">{invoiceTemplate.header_note}</div>
              )}
              <div className="my-3 border-t border-dashed border-black/60" />
              <div className="space-y-1 text-xs">
                <div>Khách: {invoiceOrder.customer_name || "Khách lẻ"}</div>
                {invoiceOrder.customer_phone && <div>SĐT: {invoiceOrder.customer_phone}</div>}
                {invoiceOrder.customer_address && <div>Địa chỉ: {invoiceOrder.customer_address}</div>}
              </div>
              <div className="my-3 border-t border-dashed border-black/60" />
              <div className="max-h-64 space-y-2 overflow-auto pr-1">
                {invoiceItems.length === 0 && (
                  <div className="py-4 text-center text-xs text-black/60">Chưa có chi tiết sản phẩm</div>
                )}
                {invoiceItems.map((item) => (
                  <div key={item.id}>
                    <div className="font-medium">{item.product_name}</div>
                    <div className="flex justify-between text-xs">
                      <span>{formatCurrency(item.sale_price, invoiceOrder.currency)} x {item.quantity}</span>
                      <span>{formatCurrency(item.subtotal, invoiceOrder.currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="my-3 border-t border-dashed border-black/60" />
              {orderDiscount(invoiceOrder) > 0 && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Tạm tính</span>
                    <span>{formatCurrency(orderSubtotal(invoiceOrder, invoiceItems), invoiceOrder.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Giảm giá</span>
                    <span>-{formatCurrency(orderDiscount(invoiceOrder), invoiceOrder.currency)}</span>
                  </div>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Tổng</span>
                <span>{formatCurrency(invoiceOrder.total, invoiceOrder.currency)}</span>
              </div>
              <div className="mt-1 text-xs">
                Thanh toán: {invoiceOrder.paid ? "Đã thanh toán" : "Chưa thanh toán"}
              </div>
              <div className="my-3 border-t border-dashed border-black/60" />
              <div className="text-center text-xs italic">
                {invoiceTemplate?.footer_note || "Cảm ơn quý khách!"}
              </div>
              {invoicePaymentQr && (invoiceOrder.currency || "VND").toUpperCase() !== "VND" && <p className="mt-3 text-center text-xs">VietQR chỉ hỗ trợ thanh toán VND.</p>}
              {invoicePaymentQr && (invoiceOrder.currency || "VND").toUpperCase() === "VND" && (
                <div className="mt-3 text-center">
                  {(() => {
                    const amount = invoiceQrAmount(invoicePaymentQr, invoiceOrder.total);
                    const addInfo = formatVietQrAddInfo(invoicePaymentQr.add_info, {
                      orderId: invoiceOrder.id,
                      amount,
                    });
                    return (
                      <>
                        <img
                          src={buildVietQrImageUrl(invoicePaymentQr, { amount, addInfo })}
                          alt={invoicePaymentQr.name}
                          className="mx-auto h-40 w-40 object-contain"
                        />
                        <div className="mt-1 text-xs font-bold">{formatVND(amount)}</div>
                        <div className="text-[11px]">{invoicePaymentQr.account_name || invoicePaymentQr.name}</div>
                        <div className="text-[11px]">{invoicePaymentQr.bank_bin} / {invoicePaymentQr.account_no}</div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Sales() {
  return <AdminGate><Inner /></AdminGate>;
}
