import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatVND } from "@/lib/format";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

const periods = [
  ["today", "Hôm nay"],
  ["yesterday", "Hôm qua"],
  ["7d", "7 ngày"],
  ["15d", "15 ngày"],
  ["60d", "60 ngày"],
  ["90d", "90 ngày"],
  ["this_month", "Tháng này"],
  ["last_month", "Tháng trước"],
  ["all", "Tất cả"],
] as const;

type Period = (typeof periods)[number][0];
type Metrics = {
  revenue: number;
  cogs: number;
  fixedExpenses: number;
  totalExpenses: number;
  receivable: number;
  payable: number;
  orders: number;
  cashIn: number;
  actualProfit: number;
  breakEvenRevenue: number;
};
type DashboardData = {
  current: Metrics;
  changes: Partial<Record<keyof Metrics, number | null>>;
  trend: Array<{ day: string; revenue: number | string; expenses: number | string }>;
  recentOrders: Array<{ id: string; order_code?: string; total: number; payment_status: string; created_at: string; customer_name?: string }>;
  recentPurchases: Array<{ id: string; product_code?: string; product_name?: string; total: number; quantity: number; payment_status: string; created_at: string }>;
};

const compactMoney = (value: number) =>
  new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function Change({ value, inverse = false }: { value?: number | null; inverse?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-[10px] text-muted-foreground"><Minus className="inline h-3 w-3" /> chưa có kỳ trước</span>;
  const positive = inverse ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`text-[10px] font-medium ${positive ? "text-emerald-600" : "text-rose-600"}`}><Icon className="inline h-3 w-3" /> {Math.abs(value).toFixed(1)}%</span>;
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date>();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/dashboard?period=${period}`);
      if (!response.ok) throw new Error(`Dashboard API ${response.status}`);
      setData(await response.json());
      setUpdatedAt(new Date());
    } finally {
      if (!silent) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const cards = useMemo(() => {
    if (!data) return [];
    const m = data.current;
    return [
      ["Doanh thu", formatVND(m.revenue), "revenue", false],
      ["Thực thu", formatVND(m.cashIn), "cashIn", false],
      ["Lợi nhuận thực tế", formatVND(m.actualProfit), "actualProfit", false],
      ["Số đơn đã bán", m.orders.toLocaleString("vi-VN"), "orders", false],
      ["Chi phí cố định", formatVND(m.fixedExpenses), "fixedExpenses", true],
      ["Tổng chi phí", formatVND(m.totalExpenses), "totalExpenses", true],
      ["Nợ phải thu", formatVND(m.receivable), "receivable", true],
      ["Nợ phải trả", formatVND(m.payable), "payable", true],
      ["Doanh thu hòa vốn", formatVND(m.breakEvenRevenue), "breakEvenRevenue", true],
      ["Giá vốn đã bán", formatVND(m.cogs), "cogs", true],
    ] as const;
  }, [data]);

  const chartData = (data?.trend || []).map((row) => ({
    ...row,
    label: new Date(`${row.day}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
    revenue: Number(row.revenue || 0),
    expenses: Number(row.expenses || 0),
  }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Tổng quan cửa hàng</h1>
          <p className="truncate text-xs text-muted-foreground">Doanh thu · dòng tiền · công nợ · lợi nhuận{updatedAt ? ` · ${updatedAt.toLocaleTimeString("vi-VN")}` : ""}</p>
        </div>
        <RefreshButton loading={loading} onClick={() => load(false)} />
      </header>

      <div className="flex shrink-0 gap-1 rounded-lg bg-muted/50 p-1">
        {periods.map(([key, label]) => <button key={key} onClick={() => setPeriod(key)} className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[11px] font-medium transition ${period === key ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
      </div>

      <section className="grid shrink-0 grid-cols-5 gap-2">
        {cards.map(([label, value, key, inverse]) => <Card key={key} className="min-w-0 p-2.5"><div className="truncate text-[10px] text-muted-foreground">{label}</div><div className="mt-0.5 truncate text-sm font-semibold xl:text-base">{value}</div><Change value={data?.changes?.[key]} inverse={inverse} /></Card>)}
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-12 gap-2">
        <Card className="col-span-7 flex min-h-0 flex-col p-3">
          <div className="mb-1 flex shrink-0 items-center justify-between"><h2 className="text-sm font-semibold">Doanh thu & chi phí</h2><span className="text-[10px] text-muted-foreground">Theo ngày</span></div>
          <div className="min-h-0 flex-1"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={9} tickLine={false} /><YAxis fontSize={9} tickFormatter={compactMoney} tickLine={false} /><Tooltip formatter={(v: number) => formatVND(Number(v))} /><Legend wrapperStyle={{ fontSize: 10 }} /><Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.12} strokeWidth={2} /><Area type="monotone" dataKey="expenses" name="Chi phí" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.08} strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
        </Card>

        <Card className="col-span-5 flex min-h-0 flex-col p-3">
          <h2 className="mb-1 shrink-0 text-sm font-semibold">Dòng tiền & hòa vốn</h2>
          <div className="grid flex-1 grid-cols-2 content-center gap-2">
            <Mini label="Thực thu" value={data?.current.cashIn || 0} />
            <Mini label="Phải thu" value={data?.current.receivable || 0} />
            <Mini label="Phải trả" value={data?.current.payable || 0} />
            <Mini label="Hòa vốn" value={data?.current.breakEvenRevenue || 0} />
          </div>
        </Card>
      </section>

      <section className="grid h-[170px] shrink-0 grid-cols-2 gap-2">
        <RecentTable title="Đơn hàng gần đây" rows={(data?.recentOrders || []).slice(0, 5).map((o) => [o.order_code || "—", o.customer_name || "Khách lẻ", formatVND(Number(o.total)), paymentLabel(o.payment_status)])} />
        <RecentTable title="Hàng nhập gần đây" rows={(data?.recentPurchases || []).slice(0, 5).map((p) => [p.product_code || "—", p.product_name || "Sản phẩm", `${p.quantity} sp`, formatVND(Number(p.total))])} />
      </section>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border bg-muted/20 p-2"><div className="text-[10px] text-muted-foreground">{label}</div><div className="mt-1 truncate text-sm font-semibold">{formatVND(value)}</div></div>;
}
function paymentLabel(status: string) { return status === "paid" ? "Đã TT" : status === "partial" ? "TT một phần" : "Còn nợ"; }
function RecentTable({ title, rows }: { title: string; rows: string[][] }) {
  return <Card className="min-h-0 overflow-hidden p-3"><h2 className="mb-1 text-sm font-semibold">{title}</h2><div className="grid gap-0.5">{rows.length ? rows.map((r, i) => <div key={i} className="grid grid-cols-[.8fr_1.4fr_1fr_.8fr] items-center gap-2 border-t py-1 text-[10px] first:border-t-0"><span className="truncate font-medium">{r[0]}</span><span className="truncate text-muted-foreground">{r[1]}</span><span className="truncate text-right">{r[2]}</span><span className="truncate text-right text-muted-foreground">{r[3]}</span></div>) : <div className="py-8 text-center text-xs text-muted-foreground">Chưa có dữ liệu</div>}</div></Card>;
}
