import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { formatVND } from "@/lib/format";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CreditCard,
  HandCoins,
  Inbox,
  Minus,
  Package,
  PiggyBank,
  ReceiptText,
  Scale,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

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

const metricIcons: Record<keyof Metrics, LucideIcon> = {
  revenue: TrendingUp,
  cashIn: Wallet,
  actualProfit: PiggyBank,
  orders: ReceiptText,
  fixedExpenses: Building2,
  totalExpenses: TrendingDown,
  receivable: HandCoins,
  payable: CreditCard,
  breakEvenRevenue: Scale,
  cogs: Package,
};

const chartAxisTick = { fill: "oklch(var(--muted-foreground))" };
const chartTooltipStyle = {
  background: "oklch(var(--popover))",
  border: "1px solid oklch(var(--border) / var(--border-alpha))",
  borderRadius: "6px",
  fontSize: 12,
};

const compactMoney = (value: number) =>
  new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value);

function Change({ value, inverse = false }: { value?: number | null; inverse?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="font-mono text-[10px] text-muted-foreground"><Minus className="inline size-3" /> chưa có kỳ trước</span>;
  const positive = inverse ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`font-mono text-[10px] font-semibold ${positive ? "text-success" : "text-destructive"}`}><Icon className="inline size-3" /> {Math.abs(value).toFixed(1)}%</span>;
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
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
      <header className="animate-rise flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase text-muted-foreground">Doanh thu · dòng tiền · công nợ · lợi nhuận{updatedAt ? ` · ${updatedAt.toLocaleTimeString("vi-VN")}` : ""}</p>
          <h1 className="font-display text-[26px] font-extrabold">Tổng quan cửa hàng</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton loading={loading} onClick={() => load(false)} />
          <Button asChild>
            <Link to="/pos">
              <ShoppingCart />
              Mở quầy bán hàng
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 gap-0.5 overflow-x-auto rounded-md border bg-card p-1 backdrop-blur-md">
        {periods.map(([key, label]) => <Button key={key} size="sm" variant={period === key ? "default" : "ghost"} onClick={() => setPeriod(key)} className="flex-1">{label}</Button>)}
      </div>

      <section className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map(([label, value, key, inverse], i) => {
          const Icon = metricIcons[key];
          return (
            <div key={key} style={{ animationDelay: `${i * 40}ms` }} className="animate-rise min-w-0 rounded-lg border bg-card p-3 backdrop-blur-md">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
                <Icon className={`size-4 shrink-0 ${inverse ? "text-muted-foreground" : "text-primary"}`} />
              </div>
              <p title={value} className="mt-1.5 truncate font-display text-lg font-extrabold xl:text-xl">{value}</p>
              <div className="mt-1 truncate"><Change value={data?.changes?.[key]} inverse={inverse} /></div>
            </div>
          );
        })}
      </section>

      <section className="grid shrink-0 gap-4 lg:min-h-[260px] lg:flex-1 lg:grid-cols-12">
        <div style={{ animationDelay: "120ms" }} className="animate-rise flex min-h-[240px] min-w-0 flex-col rounded-lg border bg-card p-4 backdrop-blur-md lg:col-span-8">
          <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-[15px] font-bold">Doanh thu & chi phí</h2>
              <p className="font-mono text-[10px] text-muted-foreground">Theo ngày</p>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Doanh thu</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />Chi phí</span>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dashboardExpensesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(var(--accent))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(var(--border) / var(--border-alpha))" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={10} tick={chartAxisTick} />
                <YAxis axisLine={false} tickLine={false} fontSize={10} tick={chartAxisTick} tickFormatter={compactMoney} />
                <Tooltip formatter={(v: number) => formatVND(Number(v))} contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="oklch(var(--primary))" fill="url(#dashboardRevenueFill)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="expenses" name="Chi phí" stroke="oklch(var(--accent))" fill="url(#dashboardExpensesFill)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ animationDelay: "180ms" }} className="animate-rise flex min-h-0 min-w-0 flex-col rounded-lg border bg-card p-4 backdrop-blur-md lg:col-span-4">
          <h2 className="mb-3 shrink-0 font-display text-[15px] font-bold">Dòng tiền & hòa vốn</h2>
          <div className="flex flex-1 flex-col justify-center gap-2">
            <Mini label="Thực thu" value={data?.current.cashIn || 0} tone="success" />
            <Mini label="Phải thu" value={data?.current.receivable || 0} tone="primary" />
            <Mini label="Phải trả" value={data?.current.payable || 0} tone="destructive" />
            <Mini label="Hòa vốn" value={data?.current.breakEvenRevenue || 0} tone="accent" />
          </div>
        </div>
      </section>

      <section className="grid shrink-0 gap-4 lg:grid-cols-2">
        <RecentTable title="Đơn hàng gần đây" rows={(data?.recentOrders || []).slice(0, 5).map((o) => [o.order_code || "—", o.customer_name || "Khách lẻ", formatVND(Number(o.total)), <span className={`rounded px-2 py-0.5 font-sans text-[10px] font-semibold ${paymentTone(o.payment_status)}`}>{paymentLabel(o.payment_status)}</span>])} />
        <RecentTable title="Hàng nhập gần đây" rows={(data?.recentPurchases || []).slice(0, 5).map((p) => [p.product_code || "—", p.product_name || "Sản phẩm", `${p.quantity} sp`, formatVND(Number(p.total))])} />
      </section>
    </div>
  );
}

const miniTones = {
  success: "border-success bg-success/8",
  primary: "border-primary bg-primary/8",
  destructive: "border-destructive bg-destructive/8",
  accent: "border-accent bg-accent/15",
} as const;

function Mini({ label, value, tone }: { label: string; value: number; tone: keyof typeof miniTones }) {
  return <div className={`flex min-w-0 items-center justify-between gap-3 rounded-md border-l-2 px-3 py-2 ${miniTones[tone]}`}><div className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">{label}</div><div title={formatVND(value)} className="min-w-0 truncate font-display text-base font-extrabold">{formatVND(value)}</div></div>;
}
function paymentLabel(status: string) { return status === "paid" ? "Đã TT" : status === "partial" ? "TT một phần" : "Còn nợ"; }
function paymentTone(status: string) { return status === "paid" ? "bg-success/10 text-success" : status === "partial" ? "bg-accent/35 text-accent-foreground" : "bg-destructive/10 text-destructive"; }
function RecentTable({ title, rows }: { title: string; rows: ReactNode[][] }) {
  return (
    <div className="flex h-[212px] min-w-0 flex-col overflow-hidden rounded-lg border bg-card backdrop-blur-md">
      <div className="shrink-0 border-b px-4 py-2.5"><h2 className="font-display text-[15px] font-bold">{title}</h2></div>
      {rows.length ? (
        <div className="min-h-0 flex-1 divide-y overflow-auto">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[.8fr_1.3fr_1fr_.9fr] items-center gap-2 px-4 py-1.5 text-[12px] hover:bg-muted/40">
              <span className="truncate font-mono text-[11px]">{r[0]}</span>
              <span className="truncate font-semibold">{r[1]}</span>
              <span className="truncate text-right font-mono">{r[2]}</span>
              <span className="truncate text-right font-mono font-semibold">{r[3]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="m-3 grid flex-1 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
          <div><Inbox className="mx-auto mb-1.5 size-6" /><p className="text-[12px]">Chưa có dữ liệu</p></div>
        </div>
      )}
    </div>
  );
}
