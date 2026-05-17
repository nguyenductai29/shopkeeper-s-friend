import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatVND } from "@/lib/format";
import { format } from "date-fns";
import { Phone, MapPin, Check, ChevronDown, ChevronUp, Users, FileSpreadsheet } from "lucide-react";
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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Công nợ khách hàng</h1>
          <p className="text-muted-foreground text-sm mt-1">Đơn hàng chưa thanh toán</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton loading={refreshing} onClick={() => load(true)} />
          <Button variant="outline" onClick={exportDebts} disabled={orders.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Xuất Excel
          </Button>
        </div>
      </div>

      <div className="grid shrink-0 sm:grid-cols-3 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Số đơn nợ</div><div className="text-2xl font-semibold mt-1">{orders.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Tổng công nợ</div><div className="text-2xl font-semibold mt-1 text-destructive">{formatVND(totalDebt)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Khách độc lập</div><div className="text-2xl font-semibold mt-1">{new Set(orders.map(o => o.customer_phone || o.customer_name)).size}</div></Card>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {orders.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            Không có công nợ — tất cả khách đã thanh toán!
          </Card>
        )}
        {orders.map((o) => (
          <Card key={o.id} className="overflow-hidden shadow-elegant">
            <div className="p-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{o.customer_name || "Khách lẻ"}</span>
                  <Badge variant="destructive">Chưa TT</Badge>
                  <span className="text-xs text-muted-foreground">{format(new Date(o.created_at), "dd/MM/yyyy HH:mm")}</span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                  {o.customer_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{o.customer_phone}</span>}
                  {o.customer_address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{o.customer_address}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-primary">{formatVND(o.total)}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toggle(o.id)}>
                  {open === o.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} Chi tiết
                </Button>
                <Button size="sm" onClick={() => markPaid(o.id)}>
                  <Check className="w-4 h-4 mr-1" /> Đã TT
                </Button>
              </div>
            </div>
            {open === o.id && (
              <div className="border-t bg-muted/30 px-4 py-3 space-y-1">
                {(items[String(o.id)] || []).map((it, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{it.product_name} <span className="text-muted-foreground">× {it.quantity}</span></span>
                    <span className="font-medium">{formatVND(it.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Debts() {
  return <AdminGate><Inner /></AdminGate>;
}
