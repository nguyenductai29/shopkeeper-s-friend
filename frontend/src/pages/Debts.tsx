import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatVND } from "@/lib/format";
import { format } from "date-fns";
import { Phone, MapPin, Check, ChevronDown, ChevronUp, Users, FileSpreadsheet, ReceiptText, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { RefreshButton } from "@/components/RefreshButton";
import { ordersStore, orderItemsStore, type EntityId, type Order, type OrderItem } from "@/lib/fileStore";
import { exportRowsToExcel } from "@/lib/exportExcel";

function Inner() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [open, setOpen] = useState<EntityId | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      const list = await ordersStore.unpaid();
      setOrders(list);
      setOpen((current) => (list.some((order) => order.id === current) ? current : null));
      setItems({});
    } finally {
      if (showLoading) setRefreshing(false);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (id: EntityId) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!items[String(id)]) {
      const orderItems = await orderItemsStore.forOrder(id);
      setItems((m) => ({ ...m, [String(id)]: orderItems }));
    }
  };

  const markPaid = async (id: EntityId) => {
    await ordersStore.setPaid(id, true);
    toast.success("Đã đánh dấu đã thanh toán");
    await load();
  };

  const exportDebts = () => {
    if (orders.length === 0) return toast.error("Không có công nợ để xuất");
    exportRowsToExcel({
      filename: `cong-no-${format(new Date(), "yyyyMMdd-HHmm")}.xls`,
      sheetName: "Cong no",
      rows: orders,
      columns: [
        { header: "ID", value: "id" },
        { header: "Thời gian", value: (row) => format(new Date(row.created_at), "dd/MM/yyyy HH:mm") },
        { header: "Khách hàng", value: (row) => row.customer_name || "Khách lẻ" },
        { header: "SĐT", value: (row) => row.customer_phone || "" },
        { header: "Địa chỉ", value: (row) => row.customer_address || "" },
        { header: "Tổng nợ", value: (row) => Number(row.total) },
        { header: "Ghi chú", value: (row) => row.note || "" },
      ],
    });
  };

  const totalDebt = orders.reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-5">
      <div className="flex shrink-0 animate-rise flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Đơn hàng chưa thanh toán</p>
          <h1 className="font-display text-[26px] font-extrabold">Công nợ khách hàng</h1>
        </div>
        <div className="flex gap-2">
          <RefreshButton loading={refreshing} onClick={() => load(true)} />
          <Button variant="outline" onClick={exportDebts} disabled={orders.length === 0}>
            <FileSpreadsheet /> Xuất Excel
          </Button>
        </div>
      </div>

      <div className="grid shrink-0 gap-3 sm:grid-cols-3">
        <div className="animate-rise rounded-lg border bg-card p-4 backdrop-blur-md">
          <div className="flex items-start justify-between">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Số đơn nợ</p>
            <ReceiptText className="size-4 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold">{orders.length}</p>
        </div>
        <div className="animate-rise rounded-lg border bg-card p-4 backdrop-blur-md" style={{ animationDelay: "60ms" }}>
          <div className="flex items-start justify-between">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Tổng công nợ</p>
            <HandCoins className="size-4 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold text-destructive">{formatVND(totalDebt)}</p>
        </div>
        <div className="animate-rise rounded-lg border bg-card p-4 backdrop-blur-md" style={{ animationDelay: "120ms" }}>
          <div className="flex items-start justify-between">
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Khách độc lập</p>
            <Users className="size-4 text-primary" />
          </div>
          <p className="mt-2 font-display text-2xl font-extrabold">{new Set(orders.map(o => o.customer_phone || o.customer_name)).size}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {orders.length === 0 && (
          <div className="grid h-56 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
            <div>
              <Users className="mx-auto mb-2 size-7" />
              <p className="text-sm">Không có công nợ — tất cả khách đã thanh toán!</p>
            </div>
          </div>
        )}
        <div className="divide-y overflow-hidden rounded-lg border bg-card backdrop-blur-md empty:hidden">
        {orders.map((o) => (
          <div key={o.id}>
            <div className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold">{o.customer_name || "Khách lẻ"}</span>
                  <span className="rounded bg-destructive/10 px-2 py-1 text-[10px] font-semibold text-destructive">Chưa TT</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{format(new Date(o.created_at), "dd/MM/yyyy HH:mm")}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  {o.customer_phone && <span className="flex items-center gap-1 font-mono"><Phone className="size-3" />{o.customer_phone}</span>}
                  {o.customer_address && <span className="flex items-center gap-1"><MapPin className="size-3" />{o.customer_address}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-semibold text-primary">{formatVND(o.total)}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toggle(o.id)}>
                  {open === o.id ? <ChevronUp /> : <ChevronDown />} Chi tiết
                </Button>
                <Button size="sm" onClick={() => markPaid(o.id)}>
                  <Check /> Đã TT
                </Button>
              </div>
            </div>
            {open === o.id && (
              <div className="space-y-1.5 border-t bg-muted/40 px-4 py-3">
                {(items[String(o.id)] || []).map((it, i) => (
                  <div key={i} className="flex justify-between gap-3 text-[12px]">
                    <span>{it.product_name} <span className="font-mono text-muted-foreground">× {it.quantity}</span></span>
                    <span className="font-mono font-semibold">{formatVND(it.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

export default function Debts() {
  return <AdminGate><Inner /></AdminGate>;
}
