import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ReceiptText, TrendingUp, WalletCards, type LucideIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AdminGate } from "@/components/AdminGate";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { orderItemsStore, ordersStore, type Order, type OrderItem } from "@/lib/fileStore";
import { formatVND } from "@/lib/format";
import { buildSalesReport, csvCell, type PaymentFilter, type ReportPeriod } from "@/lib/reporting";

const periodLabels: Record<ReportPeriod, string> = { day: "ngày", week: "tuần", month: "tháng" };

function ReportsContent() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [payment, setPayment] = useState<PaymentFilter>("all");
  const [productCode, setProductCode] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [itemsUnavailable, setItemsUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [orderResult, itemResult] = await Promise.allSettled([ordersStore.list(), orderItemsStore.list()]);
    if (orderResult.status === "fulfilled") {
      setOrders(orderResult.value);
    } else {
      setOrders([]);
      setError("Không tải được đơn hàng. Hãy kiểm tra kết nối rồi thử lại.");
    }
    if (itemResult.status === "fulfilled") {
      setItems(itemResult.value);
      setItemsUnavailable(false);
    } else {
      setItems([]);
      setProductCode("all");
      setItemsUnavailable(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const products = useMemo(() => {
    const names = new Map<string, string>();
    items.forEach((item) => {
      if (item.product_code) names.set(item.product_code, item.product_name || item.product_code);
    });
    return [...names].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [items]);
  const report = useMemo(
    () => buildSalesReport(orders, items, period, payment, productCode),
    [orders, items, period, payment, productCode],
  );
  const metrics: [string, string, string, LucideIcon][] = [
    ["Doanh thu", formatVND(report.total), `${report.count} đơn trong kỳ`, TrendingUp],
    ["Đơn hàng", String(report.count), payment === "all" ? "Đã trả và chưa trả" : payment === "paid" ? "Đã thanh toán" : "Chưa thanh toán", ReceiptText],
    ["Trung bình", formatVND(report.average), "Mỗi đơn hàng", WalletCards],
    ["Lợi nhuận gộp", formatVND(report.grossProfit), "Doanh thu trừ giá vốn", TrendingUp],
  ];

  const exportCsv = () => {
    const rows = [
      ["Ngày", "Mã đơn", "Khách hàng", "Sản phẩm", "Thanh toán", "Doanh thu", "Giá vốn", "Lợi nhuận gộp"],
      ...report.rows.map((row) => [
        new Date(row.order.created_at).toLocaleString("vi-VN"),
        row.order.id,
        row.order.customer_name || "Khách lẻ",
        row.items.map((item) => item.product_name).join("; "),
        row.order.paid ? "Đã thanh toán" : "Chưa thanh toán",
        row.revenue,
        row.cost,
        row.revenue - row.cost,
      ]),
    ];
    const blob = new Blob(["\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bao-cao-doanh-thu.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Phân tích kinh doanh</p>
            <h1 className="font-display text-[26px] font-extrabold">Báo cáo doanh thu</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>Làm mới</Button>
            <Button variant="outline" onClick={exportCsv} disabled={loading || !!error || itemsUnavailable || report.count === 0}><Download />Xuất CSV</Button>
          </div>
        </div>

        {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {itemsUnavailable && <div role="status" className="rounded-md border bg-card p-3 text-sm text-muted-foreground">Chưa tải được chi tiết sản phẩm; báo cáo đơn hàng vẫn hiển thị.</div>}

        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-md border bg-card p-1">
            {(["day", "week", "month"] as const).map((value) => (
              <Button key={value} size="sm" variant={period === value ? "default" : "ghost"} aria-pressed={period === value} onClick={() => setPeriod(value)}>
                {value === "day" ? "Ngày" : value === "week" ? "Tuần" : "Tháng"}
              </Button>
            ))}
          </div>
          <Select value={payment} onValueChange={(value: PaymentFilter) => setPayment(value)}>
            <SelectTrigger className="w-44 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi thanh toán</SelectItem>
              <SelectItem value="paid">Đã thanh toán</SelectItem>
              <SelectItem value="unpaid">Chưa thanh toán</SelectItem>
            </SelectContent>
          </Select>
          <Select value={productCode} onValueChange={setProductCode} disabled={itemsUnavailable || products.length === 0}>
            <SelectTrigger className="w-48 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả sản phẩm</SelectItem>
              {products.map(([code, name]) => <SelectItem key={code} value={code}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {productCode !== "all" && <p className="text-[11px] text-muted-foreground">Số liệu gồm phần doanh thu và giá vốn của sản phẩm đã chọn trong mỗi đơn.</p>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label, value, note, Icon], index) => (
            <div key={label} className="animate-rise rounded-lg border bg-card p-4 backdrop-blur-md" style={{ animationDelay: `${index * 60}ms` }}>
              <div className="flex items-start justify-between"><p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div>
              <p className="mt-2 font-display text-xl font-extrabold">{value}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{note}</p>
            </div>
          ))}
        </section>

        <section className="rounded-lg border bg-card p-4 backdrop-blur-md">
          <div className="mb-5"><h2 className="font-display text-[15px] font-bold">Xu hướng doanh thu</h2><p className="font-mono text-[10px] text-muted-foreground">Dữ liệu theo {periodLabels[period]}</p></div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.points}>
                <defs><linearGradient id="report-revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="oklch(0.61 0.18 28)" stopOpacity={0.3} /><stop offset="95%" stopColor="oklch(0.61 0.18 28)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="oklch(0.25 0.018 40 / 0.1)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={10} />
                <YAxis axisLine={false} tickLine={false} fontSize={10} tickFormatter={(value: number) => `${value / 1_000_000}tr`} />
                <Tooltip formatter={(value: number) => formatVND(Number(value))} contentStyle={{ background: "oklch(0.985 0.014 54)", border: "1px solid oklch(0.25 0.018 40 / 0.1)", borderRadius: "6px" }} />
                <Area type="monotone" dataKey="revenue" stroke="oklch(0.61 0.18 28)" strokeWidth={3} fill="url(#report-revenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border bg-card backdrop-blur-md">
          <div className="border-b p-4"><h2 className="font-display text-[15px] font-bold">Chi tiết doanh thu</h2><p className="font-mono text-[10px] text-muted-foreground">{report.count} đơn trong kỳ</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-[12px]">
              <thead className="bg-muted/60 font-mono text-[9px] uppercase text-muted-foreground"><tr><th className="p-3">Ngày</th><th>Khách hàng</th><th>Sản phẩm nổi bật</th><th>Mã đơn</th><th className="pr-3 text-right">Doanh thu</th></tr></thead>
              <tbody className="divide-y">
                {report.rows.map((row) => (
                  <tr key={row.order.id} className="hover:bg-muted/40">
                    <td className="p-3 font-mono">{new Date(row.order.created_at).toLocaleDateString("vi-VN")}</td>
                    <td>{row.order.customer_name || "Khách lẻ"}</td>
                    <td className="max-w-56 truncate">{row.items[0]?.product_name || "—"}</td>
                    <td className="font-mono">#{row.order.id}</td>
                    <td className="pr-3 text-right font-mono font-semibold">{formatVND(row.revenue)}</td>
                  </tr>
                ))}
                {!loading && report.count === 0 && <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">Không có đơn hàng trong kỳ và bộ lọc đã chọn.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Reports() {
  return <AdminGate><ReportsContent /></AdminGate>;
}
