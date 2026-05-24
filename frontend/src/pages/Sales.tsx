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
  Package,
  ReceiptText,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { ProductImage } from "@/components/ProductImage";
import { RefreshButton } from "@/components/RefreshButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportRowsToExcel } from "@/lib/exportExcel";
import { formatVND } from "@/lib/format";
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
      setSelectedId((current) => (list.some((order) => order.id === current) ? current : list[0]?.id ?? null));
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
    const rows = keyword
      ? orders.filter((order) => (
          String(order.id).includes(keyword)
          || String(order.customer_name || "khách lẻ").toLowerCase().includes(keyword)
          || String(order.customer_phone || "").toLowerCase().includes(keyword)
          || String(order.customer_address || "").toLowerCase().includes(keyword)
        ))
      : orders;

    return [...rows].sort((a, b) => {
      const aValue = sort.key === "profit" ? profit(a) : a[sort.key];
      const bValue = sort.key === "profit" ? profit(b) : b[sort.key];
      const result = compareValues(aValue, bValue);
      return sort.direction === "asc" ? result : -result;
    });
  }, [orders, search, sort]);

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
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => handleSort(sortKey)}
          className="flex w-full items-center gap-1 text-left font-medium hover:text-foreground"
        >
          <span>{children}</span>
          <Icon className="h-3.5 w-3.5 shrink-0" />
        </button>
      </TableHead>
    );
  };

  const loadOrderItems = async (id: EntityId) => {
    if (!items[String(id)]) {
      const orderItems = await orderItemsStore.forOrder(id);
      setItems((current) => ({ ...current, [String(id)]: orderItems }));
      return orderItems;
    }
    return items[String(id)];
  };

  const openOrder = async (id: EntityId) => {
    setSelectedId(id);
    await loadOrderItems(id);
  };

  const openInvoice = async (id: EntityId) => {
    setSelectedId(id);
    setInvoiceOrderId(id);
    await loadOrderItems(id);
  };

  useEffect(() => {
    if (!selectedId || items[String(selectedId)]) return;
    orderItemsStore.forOrder(selectedId).then((orderItems) => {
      setItems((current) => ({ ...current, [String(selectedId)]: orderItems }));
    });
  }, [selectedId, items]);

  const markPaid = async (order: Order) => {
    await ordersStore.setPaid(order.id, true);
    toast.success("Đã đánh dấu đã thanh toán");
    await loadOrders();
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
          <h1 className="text-2xl font-semibold md:text-3xl">Quản lý bán hàng</h1>
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

      <Card className="shrink-0 p-3 shadow-elegant">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="pl-9"
            placeholder="Tìm theo mã đơn, khách hàng, SĐT hoặc địa chỉ..."
          />
        </div>
      </Card>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="flex min-h-0 flex-col overflow-hidden shadow-elegant">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="min-w-[1040px]">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <SortableHead sortKey="id" className="w-20">ID</SortableHead>
                  <SortableHead sortKey="created_at" className="w-40">Thời gian</SortableHead>
                  <SortableHead sortKey="customer_name">Khách hàng</SortableHead>
                  <SortableHead sortKey="discount" className="w-32 text-right">Giảm giá</SortableHead>
                  <SortableHead sortKey="total" className="w-36 text-right">Doanh thu</SortableHead>
                  <SortableHead sortKey="cost_total" className="w-32 text-right">Giá vốn</SortableHead>
                  <SortableHead sortKey="profit" className="w-32 text-right">Lãi</SortableHead>
                  <SortableHead sortKey="paid" className="w-32">Trạng thái</SortableHead>
                  <TableHead className="w-24 text-right">Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      <ReceiptText className="mx-auto mb-2 h-10 w-10 opacity-40" />
                      Chưa có đơn hàng.
                    </TableCell>
                  </TableRow>
                )}
                {visibleOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    data-state={selectedId === order.id ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => openOrder(order.id)}
                  >
                    <TableCell className="font-medium">#{order.id}</TableCell>
                    <TableCell>{formatDateTime(order.created_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{order.customer_name || "Khách lẻ"}</div>
                      <div className="text-xs text-muted-foreground">{order.customer_phone || ""}</div>
                    </TableCell>
                    <TableCell className="text-right">{formatVND(orderDiscount(order))}</TableCell>
                    <TableCell className="text-right font-semibold">{formatVND(order.total)}</TableCell>
                    <TableCell className="text-right">{formatVND(order.cost_total)}</TableCell>
                    <TableCell className="text-right">{formatVND(profit(order))}</TableCell>
                    <TableCell>
                      {order.paid ? (
                        <Badge variant="secondary">Đã TT</Badge>
                      ) : (
                        <Badge variant="destructive">Chưa TT</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          openInvoice(order.id);
                        }}
                        title="Xem hoá đơn"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

        <Card className="flex min-h-0 flex-col overflow-hidden shadow-elegant">
          <div className="shrink-0 border-b p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">
                  {selectedOrder ? `Đơn #${selectedOrder.id}` : "Chi tiết đơn"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedOrder ? formatDateTime(selectedOrder.created_at) : "Chọn một đơn để xem"}
                </div>
              </div>
              {selectedOrder && !selectedOrder.paid && (
                <Button size="sm" onClick={() => markPaid(selectedOrder)}>
                  <Check className="mr-1 h-4 w-4" /> Đã TT
                </Button>
              )}
            </div>
          </div>

          {!selectedOrder ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Chưa chọn đơn hàng
            </div>
          ) : (
            <>
              <div className="shrink-0 space-y-1 border-b p-3 text-sm">
                <div className="font-medium">{selectedOrder.customer_name || "Khách lẻ"}</div>
                {selectedOrder.customer_phone && <div className="text-muted-foreground">{selectedOrder.customer_phone}</div>}
                {selectedOrder.customer_address && <div className="text-muted-foreground">{selectedOrder.customer_address}</div>}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
                {selectedItems.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    Chưa tải chi tiết
                  </div>
                )}
                {selectedItems.map((item) => (
                  <div key={item.id} className="flex gap-2 rounded-md bg-muted/40 p-2">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-background">
                      <ProductImage src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.product_name}</div>
                      <div className="text-xs text-muted-foreground">{item.product_code} x {item.quantity}</div>
                    </div>
                    <div className="text-right text-sm font-semibold">{formatVND(item.subtotal)}</div>
                  </div>
                ))}
              </div>

              <div className="shrink-0 space-y-1 border-t p-3">
                {orderDiscount(selectedOrder) > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Tạm tính</span><span>{formatVND(orderSubtotal(selectedOrder, selectedItems))}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Giảm giá</span><span>-{formatVND(orderDiscount(selectedOrder))}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Giá vốn</span><span>{formatVND(selectedOrder.cost_total)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Lợi nhuận</span><span>{formatVND(profit(selectedOrder))}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold">
                  <span>Tổng tiền</span><span className="text-primary">{formatVND(selectedOrder.total)}</span>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <Dialog open={!!invoiceOrderId} onOpenChange={(open) => !open && setInvoiceOrderId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{invoiceOrder ? `Hoá đơn #${invoiceOrder.id}` : "Hoá đơn"}</DialogTitle>
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
                      <span>{formatVND(item.sale_price)} x {item.quantity}</span>
                      <span>{formatVND(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="my-3 border-t border-dashed border-black/60" />
              {orderDiscount(invoiceOrder) > 0 && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Tạm tính</span>
                    <span>{formatVND(orderSubtotal(invoiceOrder, invoiceItems))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Giảm giá</span>
                    <span>-{formatVND(orderDiscount(invoiceOrder))}</span>
                  </div>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Tổng</span>
                <span>{formatVND(invoiceOrder.total)}</span>
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
