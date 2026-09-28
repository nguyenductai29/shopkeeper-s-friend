import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileSpreadsheet,
  MapPin,
  Package,
  ReceiptText,
  Save,
  Search,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { ProductImage } from "@/components/ProductImage";
import { RefreshButton } from "@/components/RefreshButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportRowsToExcel } from "@/lib/exportExcel";
import { formatMoneyInput, formatVND, parseMoneyInput } from "@/lib/format";
import {
  invoiceTemplatesStore,
  orderItemsStore,
  ordersStore,
  paymentQrsStore,
  productsStore,
  type EntityId,
  type InvoiceTemplate,
  type Order,
  type OrderItem,
  type PaymentQr,
} from "@/lib/fileStore";
import { cn } from "@/lib/utils";
import { buildVietQrImageUrl, formatVietQrAddInfo, invoiceQrAmount } from "@/lib/vietqr";

type SortKey = "created_at" | "customer_name" | "total" | "cost_total" | "discount" | "profit" | "paid";
type SortDirection = "asc" | "desc";
// Candidate images, best first; ProductImage falls back through them.
type ShownItem = OrderItem & { image_urls: string[] };

const PAGE_SIZE = 12;
const COLUMN_COUNT = 10;
const NUMERIC_SORT_KEYS: SortKey[] = ["total", "cost_total", "discount", "profit"];

function formatDateTime(value: string) {
  return format(new Date(value), "dd/MM/yyyy HH:mm");
}

function profit(order: Order) {
  return Number(order.total || 0) - Number(order.cost_total || 0);
}

function orderDiscount(order: Order) {
  return Number(order.discount || 0);
}

// Same rule as the shared API: legacy rows may store subtotal 0.
function orderSubtotal(order: Order) {
  return Math.max(Number(order.subtotal || 0), Number(order.total || 0) + orderDiscount(order));
}

function orderLabel(order: Order) {
  return order.order_code ? `#${order.order_code}` : "";
}

function sortValue(order: Order, key: SortKey) {
  if (key === "profit") return profit(order);
  if (NUMERIC_SORT_KEYS.includes(key)) return Number(order[key] || 0);
  if (key === "paid") return order.paid ? 1 : 0;
  return order[key];
}

function compareValues(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "vi", { numeric: true, sensitivity: "base" });
}

// Brings a just-opened detail row into view; it often lands below the fold on laptop screens.
// Scrolls only as far as needed and never past its order row, which stays under the sticky header.
// Module-level so the ref stays stable and fires only on mount, not on every keystroke.
function revealRow(row: HTMLTableRowElement | null) {
  const scroller = row?.closest<HTMLElement>("[data-orders-scroll]");
  const orderRow = row?.previousElementSibling;
  if (!row || !scroller || !orderRow) return;
  const view = scroller.getBoundingClientRect();
  const headerHeight = scroller.querySelector("thead")?.getBoundingClientRect().height ?? 0;
  const overflow = row.getBoundingClientRect().bottom - view.bottom;
  const room = orderRow.getBoundingClientRect().top - (view.top + headerHeight);
  if (overflow > 0) scroller.scrollBy({ top: Math.min(overflow, room), behavior: "smooth" });
}

function groupItemsByOrder(list: ShownItem[]) {
  const grouped: Record<string, ShownItem[]> = {};
  for (const item of list) {
    (grouped[String(item.order_id)] ||= []).push(item);
  }
  return grouped;
}

function PaymentStatus({ order, onClick }: { order: Order; onClick: () => void }) {
  const partial = !order.paid && order.payment_status === "partial";
  const label = order.paid ? "Đã TT" : partial ? "TT 1 phần" : "Chưa TT";
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={order.paid ? "Bấm để chuyển sang Chưa thanh toán" : "Bấm để đánh dấu Đã thanh toán"}
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        order.paid && "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        partial && "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300",
        !order.paid && !partial && "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
      )}
    >
      {label}
    </button>
  );
}

// Names only: thumbnails at row size were unreadable; the tree row shows real images.
function ProductSummary({ items }: { items: ShownItem[] }) {
  if (items.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return (
    <div title={items.map((item) => `${item.product_name} x${item.quantity}`).join("\n")}>
      <div className="truncate">{items[0].product_name}</div>
      <div className="truncate text-xs text-muted-foreground">
        {items.length > 1 ? `+${items.length - 1} sản phẩm khác · ` : ""}SL {quantity}
      </div>
    </div>
  );
}

function OrderEditor({
  order,
  onSave,
}: {
  order: Order;
  onSave: (patch: { discount?: number; paid?: boolean }) => Promise<boolean>;
}) {
  const subtotal = orderSubtotal(order);
  const [discount, setDiscount] = useState(orderDiscount(order));
  const [paid, setPaid] = useState(Boolean(order.paid));
  const [saving, setSaving] = useState(false);
  const total = Math.max(0, subtotal - discount);
  const discountChanged = discount !== orderDiscount(order);
  const paidChanged = paid !== Boolean(order.paid);
  const costTotal = Number(order.cost_total || 0);

  const reset = () => {
    setDiscount(orderDiscount(order));
    setPaid(Boolean(order.paid));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Send only what changed: an untouched switch on a partly paid order must not void its receipts.
      await onSave({
        ...(discountChanged ? { discount } : {}),
        ...(paidChanged ? { paid } : {}),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="text-sm font-semibold">Chỉnh sửa đơn</div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Tạm tính</span><span>{formatVND(subtotal)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Giảm giá</Label>
          <Input
            inputMode="numeric"
            value={formatMoneyInput(discount)}
            onChange={(event) => setDiscount(Math.min(parseMoneyInput(event.target.value), subtotal))}
            className="text-right"
          />
        </div>
        <div>
          <Label className="text-xs">Doanh thu</Label>
          <Input
            inputMode="numeric"
            value={formatMoneyInput(total)}
            onChange={(event) => setDiscount(subtotal - Math.min(parseMoneyInput(event.target.value), subtotal))}
            className="text-right font-semibold"
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
        <Label htmlFor={`paid-${order.id}`} className="cursor-pointer text-sm">Đã thanh toán</Label>
        <Switch id={`paid-${order.id}`} checked={paid} onCheckedChange={setPaid} />
      </div>
      {paidChanged && !paid && (
        <p className="text-xs text-destructive">Các khoản thu đã ghi nhận cho đơn này sẽ bị huỷ.</p>
      )}
      <div className="space-y-1 border-t pt-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Giá vốn</span><span>{formatVND(costTotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Lợi nhuận</span>
          <span className={cn(total - costTotal < 0 && "text-destructive")}>{formatVND(total - costTotal)}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={reset} disabled={saving || (!discountChanged && !paidChanged)}>
          Huỷ
        </Button>
        <Button size="sm" onClick={save} disabled={saving || (!discountChanged && !paidChanged)}>
          <Save className="mr-1.5 h-4 w-4" /> {saving ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      </div>
    </div>
  );
}

function OrderDetail({
  order,
  items,
  onSave,
  onPreview,
}: {
  order: Order;
  items: ShownItem[];
  onSave: (patch: { discount?: number; paid?: boolean }) => Promise<boolean>;
  onPreview: (item: ShownItem) => void;
}) {
  return (
    <div className="grid gap-4 py-2 pl-4 pr-2 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {order.order_code && <span>Mã đơn {order.order_code}</span>}
          {order.customer_address && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {order.customer_address}
            </span>
          )}
        </div>
        {/* Tree branch: a vertical rail with one connector per product. */}
        <div className="ml-1 space-y-2 border-l-2 border-primary/25 pl-5">
          {items.length === 0 && (
            <div className="py-6 text-sm text-muted-foreground">
              <Package className="mb-1 h-6 w-6 opacity-40" />
              Đơn này chưa có chi tiết sản phẩm
            </div>
          )}
          {items.map((item) => (
            <div key={item.id} className="relative flex items-center gap-3 rounded-lg bg-muted/40 p-2">
              <span className="absolute -left-5 top-1/2 h-0.5 w-5 bg-primary/25" aria-hidden />
              {item.image_urls.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onPreview(item)}
                  title="Xem ảnh lớn"
                  className="group relative flex h-16 w-16 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ProductImage src={item.image_urls} alt={item.product_name} className="h-full w-full object-contain" iconClassName="h-6 w-6" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <ZoomIn className="h-5 w-5 text-white" />
                  </span>
                </button>
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border bg-background">
                  <Package className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{item.product_name}</div>
                <div className="text-xs text-muted-foreground">{item.product_code}</div>
              </div>
              <div className="shrink-0 text-right text-sm text-muted-foreground">
                {formatVND(Number(item.sale_price))} × {item.quantity}
              </div>
              <div className="w-32 shrink-0 text-right font-semibold">{formatVND(Number(item.subtotal))}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Remount when the saved order changes so the draft starts from the new values. */}
      <OrderEditor key={`${order.total}-${order.paid}-${order.payment_status}`} order={order} onSave={onSave} />
    </div>
  );
}

function Inner() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, ShownItem[]>>({});
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [paymentQrs, setPaymentQrs] = useState<PaymentQr[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [invoiceOrderId, setInvoiceOrderId] = useState<EntityId | null>(null);
  const [unpaidConfirm, setUnpaidConfirm] = useState<Order | null>(null);
  const [previewItem, setPreviewItem] = useState<ShownItem | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "created_at",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      const [list, itemList, productList, templateList, qrList] = await Promise.all([
        ordersStore.list(),
        orderItemsStore.list(),
        productsStore.list(),
        invoiceTemplatesStore.list(),
        paymentQrsStore.list(),
      ]);
      setOrders(list);
      const productImages = new Map(productList.map((product) => [String(product.id), product.image_url]));
      setItems(groupItemsByOrder(itemList.map((item) => ({
        ...item,
        // Prefer the product's current image: replacing it deletes the file the sale recorded.
        image_urls: [productImages.get(String(item.product_id)), item.image_url]
          .filter((url): url is string => Boolean(url)),
      }))));
      setTemplates(templateList);
      setPaymentQrs(qrList);
    } finally {
      if (showLoading) setRefreshing(false);
    }
  };

  useEffect(() => { loadOrders(); }, []);

  const itemsOf = (order: Order) => items[String(order.id)] || [];
  const invoiceOrder = orders.find((order) => order.id === invoiceOrderId) ?? null;
  const invoiceItems = invoiceOrder ? itemsOf(invoiceOrder) : [];
  const invoiceTemplate = templates.find((template) => template.is_default) || templates[0] || null;
  const invoicePaymentQr = invoiceTemplate?.payment_qr_id
    ? paymentQrs.find((qr) => String(qr.id) === String(invoiceTemplate.payment_qr_id)) || null
    : null;

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const rows = keyword
      ? orders.filter((order) => (
          String(order.order_code || "").toLowerCase().includes(keyword)
          || String(order.customer_name || "khách lẻ").toLowerCase().includes(keyword)
          || String(order.customer_phone || "").toLowerCase().includes(keyword)
          || String(order.customer_address || "").toLowerCase().includes(keyword)
          || (items[String(order.id)] || []).some((item) => (
            item.product_name.toLowerCase().includes(keyword)
            || String(item.product_code || "").toLowerCase().includes(keyword)
          ))
        ))
      : orders;

    return [...rows].sort((a, b) => {
      const result = compareValues(sortValue(a, sort.key), sortValue(b, sort.key));
      return sort.direction === "asc" ? result : -result;
    });
  }, [orders, items, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleOrders = filteredOrders.slice(pageStart, pageStart + PAGE_SIZE);
  const allVisibleExpanded = visibleOrders.length > 0 && visibleOrders.every((order) => expanded.has(String(order.id)));

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

  const toggleExpanded = (id: EntityId) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(String(id))) next.add(String(id));
      return next;
    });
  };

  const toggleAllVisible = () => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const order of visibleOrders) {
        if (allVisibleExpanded) next.delete(String(order.id));
        else next.add(String(order.id));
      }
      return next;
    });
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
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => handleSort(sortKey)}
          className={cn(
            "flex w-full items-center gap-1 font-medium hover:text-foreground",
            className.includes("text-right") ? "justify-end" : "text-left",
          )}
        >
          <span>{children}</span>
          <Icon className="h-3.5 w-3.5 shrink-0" />
        </button>
      </TableHead>
    );
  };

  const updateOrder = async (order: Order, patch: { discount?: number; paid?: boolean }) => {
    try {
      const saved = await ordersStore.update(order.id, patch);
      setOrders((current) => current.map((row) => (row.id === order.id ? { ...row, ...saved } : row)));
      toast.success(
        patch.paid === undefined
          ? "Đã cập nhật đơn hàng"
          : patch.paid ? "Đã đánh dấu đã thanh toán" : "Đã chuyển sang chưa thanh toán",
      );
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không cập nhật được đơn hàng");
      return false;
    }
  };

  const togglePaid = (order: Order) => {
    // Voiding receipts is the destructive direction, so it asks first.
    if (order.paid) setUnpaidConfirm(order);
    else updateOrder(order, { paid: true });
  };

  const exportSales = () => {
    if (filteredOrders.length === 0) return toast.error("Không có dữ liệu bán hàng để xuất");
    exportRowsToExcel({
      filename: `ban-hang-${format(new Date(), "yyyyMMdd-HHmm")}.xls`,
      sheetName: "Ban hang",
      rows: filteredOrders,
      columns: [
        { header: "Mã đơn", value: (row) => row.order_code || String(row.id) },
        { header: "Thời gian", value: (row) => formatDateTime(row.created_at) },
        { header: "Khách hàng", value: (row) => row.customer_name || "Khách lẻ" },
        { header: "SĐT", value: (row) => row.customer_phone || "" },
        { header: "Địa chỉ", value: (row) => row.customer_address || "" },
        {
          header: "Sản phẩm",
          value: (row) => itemsOf(row).map((item) => `${item.product_name} x${item.quantity}`).join(", "),
        },
        { header: "Giảm giá", value: (row) => orderDiscount(row) },
        { header: "Doanh thu", value: (row) => Number(row.total) },
        { header: "Giá vốn", value: (row) => Number(row.cost_total) },
        { header: "Lợi nhuận", value: (row) => profit(row) },
        { header: "Thanh toán", value: (row) => (row.paid ? "Đã thanh toán" : "Chưa thanh toán") },
      ],
    });
  };

  const rangeStart = filteredOrders.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + visibleOrders.length, filteredOrders.length);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight">Quản lý bán hàng</h1>
          <p className="mt-1 text-sm text-muted-foreground">Theo dõi đơn hàng, doanh thu và trạng thái thanh toán</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton loading={refreshing} onClick={() => loadOrders(true)} />
          <Button variant="outline" onClick={exportSales} disabled={filteredOrders.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Xuất Excel
          </Button>
        </div>
      </div>

      <div className="grid shrink-0 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Số đơn</div>
          <div className="mt-1 text-2xl font-semibold">{stats.orders}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Doanh thu</div>
          <div className="mt-1 text-2xl font-semibold text-primary">{formatVND(stats.revenue)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Lợi nhuận</div>
          <div className="mt-1 text-2xl font-semibold">{formatVND(stats.profit)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Chưa thanh toán</div>
          <div className="mt-1 text-2xl font-semibold text-destructive">{stats.unpaid}</div>
        </Card>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-elegant">
        <div className="relative shrink-0 border-b p-2">
          <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="pl-9"
            placeholder="Tìm theo mã đơn, khách hàng, SĐT, địa chỉ hoặc sản phẩm..."
          />
        </div>
        {/* A bare <table>: the <Table> wrapper adds its own overflow box, which breaks the sticky header. */}
        <div data-orders-scroll className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1040px] caption-bottom text-[13px]">
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-12 px-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={toggleAllVisible}
                    disabled={visibleOrders.length === 0}
                    title={allVisibleExpanded ? "Thu gọn tất cả" : "Mở tất cả"}
                  >
                    {allVisibleExpanded ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
                  </Button>
                </TableHead>
                <SortableHead sortKey="created_at" className="w-28">Thời gian</SortableHead>
                <SortableHead sortKey="customer_name" className="w-40">Khách hàng</SortableHead>
                <TableHead>Sản phẩm</TableHead>
                <SortableHead sortKey="discount" className="w-[104px] text-right">Giảm giá</SortableHead>
                <SortableHead sortKey="total" className="w-32 text-right">Doanh thu</SortableHead>
                <SortableHead sortKey="cost_total" className="w-[104px] text-right">Giá vốn</SortableHead>
                <SortableHead sortKey="profit" className="w-[104px] text-right">Lãi</SortableHead>
                <SortableHead sortKey="paid" className="w-28">Trạng thái</SortableHead>
                <TableHead className="w-14 text-right">HĐ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className="py-10 text-center text-muted-foreground">
                    <ReceiptText className="mx-auto mb-2 h-10 w-10 opacity-40" />
                    Chưa có đơn hàng.
                  </TableCell>
                </TableRow>
              )}
              {visibleOrders.map((order) => {
                const isOpen = expanded.has(String(order.id));
                const orderItems = itemsOf(order);
                return (
                  <Fragment key={order.id}>
                    <TableRow
                      data-state={isOpen ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => toggleExpanded(order.id)}
                    >
                      <TableCell className="px-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "Thu gọn chi tiết" : "Xem chi tiết"}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleExpanded(order.id);
                          }}
                        >
                          <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div>{format(new Date(order.created_at), "dd/MM/yyyy")}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(order.created_at), "HH:mm")}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{order.customer_name || "Khách lẻ"}</div>
                        <div className="text-xs text-muted-foreground">{order.customer_phone || ""}</div>
                      </TableCell>
                      {/* The only auto-width column: it gets the leftover width, and max-w-0 lets long names truncate. */}
                      <TableCell className="max-w-0">
                        <ProductSummary items={orderItems} />
                      </TableCell>
                      <TableCell className="text-right">{formatVND(orderDiscount(order))}</TableCell>
                      <TableCell className="text-right font-semibold">{formatVND(Number(order.total))}</TableCell>
                      <TableCell className="text-right">{formatVND(Number(order.cost_total))}</TableCell>
                      <TableCell className={cn("text-right", profit(order) < 0 && "text-destructive")}>
                        {formatVND(profit(order))}
                      </TableCell>
                      <TableCell>
                        <PaymentStatus order={order} onClick={() => togglePaid(order)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            setInvoiceOrderId(order.id);
                          }}
                          title="Xem hoá đơn"
                        >
                          <ReceiptText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow
                        className="bg-muted/20 hover:bg-muted/20"
                        ref={revealRow}
                      >
                        <TableCell colSpan={COLUMN_COUNT} className="p-3">
                          <OrderDetail
                            order={order}
                            items={orderItems}
                            onSave={(patch) => updateOrder(order, patch)}
                            onPreview={setPreviewItem}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </table>
        </div>
        <div className="flex shrink-0 flex-col justify-between gap-3 border-t px-4 py-2 sm:flex-row sm:items-center">
          <div className="text-sm text-muted-foreground">
            Hiển thị {rangeStart}-{rangeEnd} / {filteredOrders.length}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-24 text-center text-sm">
              Trang {currentPage} / {totalPages}
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <AlertDialog open={!!unpaidConfirm} onOpenChange={(open) => !open && setUnpaidConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chuyển sang chưa thanh toán?</AlertDialogTitle>
            <AlertDialogDescription>
              Đơn của {unpaidConfirm?.customer_name || "Khách lẻ"} ({formatVND(Number(unpaidConfirm?.total || 0))}) sẽ
              chuyển về chưa thanh toán và các khoản thu đã ghi nhận cho đơn sẽ bị huỷ khỏi Thu &amp; Chi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ nguyên</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unpaidConfirm) updateOrder(unpaidConfirm, { paid: false });
                setUnpaidConfirm(null);
              }}
            >
              Chuyển sang chưa TT
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-6">{previewItem?.product_name}</DialogTitle>
            <DialogDescription>
              {previewItem && `${previewItem.product_code} · ${formatVND(Number(previewItem.sale_price))} × ${previewItem.quantity}`}
            </DialogDescription>
          </DialogHeader>
          {previewItem && (
            // 70vh keeps the whole dialog on a 768px-tall laptop screen.
            <div className="flex h-[70vh] items-center justify-center overflow-hidden rounded-md bg-muted">
              <ProductImage
                src={previewItem.image_urls}
                alt={previewItem.product_name}
                className="h-full w-full object-contain"
                iconClassName="h-16 w-16"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!invoiceOrderId} onOpenChange={(open) => !open && setInvoiceOrderId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{invoiceOrder ? `Hoá đơn ${orderLabel(invoiceOrder)}`.trim() : "Hoá đơn"}</DialogTitle>
          </DialogHeader>
          {invoiceOrder && (
            <div className="rounded-md border bg-white p-5 font-mono text-sm text-black">
              <div className="text-center">
                <div className="text-lg font-bold">{invoiceTemplate?.shop_name || "ShopFlow"}</div>
                {invoiceTemplate?.shop_address && <div className="text-xs">{invoiceTemplate.shop_address}</div>}
                {invoiceTemplate?.shop_phone && <div className="text-xs">SĐT: {invoiceTemplate.shop_phone}</div>}
              </div>
              <div className="my-3 border-t border-dashed border-black/60" />
              <div className="text-center font-semibold">HOÁ ĐƠN BÁN HÀNG</div>
              <div className="mt-1 text-center text-xs">
                {orderLabel(invoiceOrder)} {formatDateTime(invoiceOrder.created_at)}
              </div>
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
                      <span>{formatVND(Number(item.sale_price))} x {item.quantity}</span>
                      <span>{formatVND(Number(item.subtotal))}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="my-3 border-t border-dashed border-black/60" />
              {orderDiscount(invoiceOrder) > 0 && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Tạm tính</span>
                    <span>{formatVND(orderSubtotal(invoiceOrder))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Giảm giá</span>
                    <span>-{formatVND(orderDiscount(invoiceOrder))}</span>
                  </div>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Tổng</span>
                <span>{formatVND(Number(invoiceOrder.total))}</span>
              </div>
              <div className="mt-1 text-xs">
                Thanh toán: {invoiceOrder.paid ? "Đã thanh toán" : "Chưa thanh toán"}
              </div>
              <div className="my-3 border-t border-dashed border-black/60" />
              <div className="text-center text-xs italic">
                {invoiceTemplate?.footer_note || "Cảm ơn quý khách!"}
              </div>
              {invoicePaymentQr && (
                <div className="mt-3 text-center">
                  {(() => {
                    const amount = invoiceQrAmount(invoicePaymentQr, Number(invoiceOrder.total));
                    const addInfo = formatVietQrAddInfo(invoicePaymentQr.add_info, {
                      orderId: invoiceOrder.order_code || invoiceOrder.id,
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
