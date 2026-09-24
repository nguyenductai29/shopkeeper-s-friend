import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CreditCard,
  HandCoins,
  Inbox,
  Minus,
  Package,
  PiggyBank,
  RefreshCw,
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

const mainCardKeys: (keyof Metrics)[] = ["revenue", "orders", "actualProfit", "cashIn"];
const detailCardKeys: (keyof Metrics)[] = ["fixedExpenses", "totalExpenses", "receivable", "payable", "breakEvenRevenue", "cogs"];

const chartAxisTick = { fill: "oklch(var(--muted-foreground))" };
const chartTooltipStyle = {
  background: "oklch(var(--popover))",
  border: "1px solid oklch(var(--border) / var(--border-alpha))",
  borderRadius: "6px",
  fontSize: 12,
};

function Change({ value, inverse = false }: { value?: number | null; inverse?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="font-mono text-[10px] text-muted-foreground"><Minus className="inline size-3" /> chưa có kỳ trước</span>;
  const positive = inverse ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`font-mono text-[10px] font-semibold ${positive ? "text-success" : "text-destructive"}`}><Icon className="inline size-3" /> {Math.abs(value).toFixed(1)}%</span>;
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("today");
  const [currency, setCurrency] = useState("VND");
  const [loadedCurrency, setLoadedCurrency] = useState("VND");
  const requestId = useRef(0);
  const formatMoney = useCallback((amount: number) => formatCurrency(amount, loadedCurrency), [loadedCurrency]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [loadedPeriod, setLoadedPeriod] = useState<Period | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    const currentRequest = ++requestId.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await fetch(`/api/dashboard?period=${period}&currency=${currency}`);
      if (!response.ok) throw new Error(`Dashboard API ${response.status}`);
      const result: DashboardData = await response.json();
      if (currentRequest !== requestId.current) return;
      setData(result);
      setLoadedCurrency(currency);
      setLoadedPeriod(period);
      setUpdatedAt(new Date());
      setError(null);
    } catch {
      if (currentRequest !== requestId.current) return;
      setError("Không tải được dữ liệu tổng quan. Hãy kiểm tra kết nối rồi thử lại.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [period, currency]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const cards = useMemo(() => {
    const m = data?.current;
    return [
      ["Doanh thu", m ? formatMoney(m.revenue) : null, "revenue", false],
      ["Số đơn đã bán", m ? m.orders.toLocaleString("vi-VN") : null, "orders", false],
      ["Lợi nhuận thực tế", m ? formatMoney(m.actualProfit) : null, "actualProfit", false],
      ["Thực thu", m ? formatMoney(m.cashIn) : null, "cashIn", false],
      ["Chi phí cố định", m ? formatMoney(m.fixedExpenses) : null, "fixedExpenses", true],
      ["Tổng chi tiền", m ? formatMoney(m.totalExpenses) : null, "totalExpenses", true],
      ["Nợ phải thu", m ? formatMoney(m.receivable) : null, "receivable", true],
      ["Nợ phải trả", m ? formatMoney(m.payable) : null, "payable", true],
      ["Doanh thu hòa vốn", m ? formatMoney(m.breakEvenRevenue) : null, "breakEvenRevenue", true],
      ["Giá vốn đã bán", m ? formatMoney(m.cogs) : null, "cogs", true],
    ] as const;
  }, [data, formatMoney]);

  const chartData = (data?.trend || []).map((row) => ({
    ...row,
    label: new Date(`${row.day}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
    revenue: Number(row.revenue || 0),
    expenses: Number(row.expenses || 0),
  }));

  const pendingOrder = data?.recentOrders.find((order) => order.payment_status !== "paid");
  const renderCard = ([label, value, key, inverse]: (typeof cards)[number], i: number) => {
    const Icon = metricIcons[key];
    return (
      <div key={key} style={{ animationDelay: `${i * 60}ms` }} className="animate-rise min-w-0 rounded-lg border bg-card p-3 backdrop-blur-md">
        <div className="flex items-start justify-between gap-2">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>
          <Icon className={`size-4 shrink-0 ${inverse ? "text-muted-foreground" : "text-primary"}`} />
        </div>
        <p title={value ?? undefined} className={`mt-1 truncate font-display font-extrabold ${value === null ? "text-sm text-muted-foreground" : "text-xl"}`}>{value ?? (loading ? "Đang tải dữ liệu…" : "Chưa có dữ liệu")}</p>
        <div className="mt-1 truncate">{data ? <Change value={data.changes?.[key]} inverse={inverse} /> : <span className="font-mono text-[10px] text-muted-foreground">Chưa có số liệu so sánh</span>}</div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 sm:p-4">
      <header className="animate-rise flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[10px] uppercase text-muted-foreground">Tổng quan · {periods.find(([key]) => key === period)?.[1]}{updatedAt ? ` · cập nhật ${updatedAt.toLocaleTimeString("vi-VN")}` : ""}</p>
          <h1 title="Tổng quan cửa hàng" className="truncate font-display text-[22px] font-extrabold sm:text-[26px]">Tổng quan cửa hàng</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select aria-label="Đơn vị tiền tổng quan" value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-9 rounded-md border bg-card px-2 text-xs"><option value="VND">VND</option><option value="JPY">JPY</option></select>
          <div className="hidden sm:block"><RefreshButton loading={loading} onClick={() => load(false)} /></div>
          <Button size="icon" variant="outline" className="sm:hidden" aria-label="Làm mới" title="Làm mới" disabled={loading} onClick={() => load(false)}><RefreshCw className={loading ? "animate-spin" : undefined} /></Button>
          <Button asChild>
            <Link to="/pos" aria-label="Mở quầy bán hàng" title="Mở quầy bán hàng">
              <ShoppingCart />
              <span className="hidden sm:inline">Mở quầy bán hàng</span>
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 gap-0.5 overflow-x-auto rounded-md border bg-card p-1 backdrop-blur-md">
        {periods.map(([key, label]) => <Button key={key} size="sm" variant={period === key ? "default" : "ghost"} onClick={() => setPeriod(key)} className="flex-1">{label}</Button>)}
      </div>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"><span>{error}{data && " Đang hiển thị dữ liệu đã tải trước đó."}</span><Button size="sm" variant="outline" onClick={() => void load(false)} disabled={loading}>Thử lại</Button></div>}
      {data && loadedPeriod !== period && <p className="font-mono text-[10px] text-muted-foreground">Dữ liệu đang hiển thị thuộc kỳ {periods.find(([key]) => key === loadedPeriod)?.[1]}.</p>}
      {data && loadedCurrency !== currency && <p className="font-mono text-[10px] text-muted-foreground">Dữ liệu đang hiển thị theo {loadedCurrency}.</p>}

      <section className="grid shrink-0 grid-cols-[repeat(4,minmax(160px,1fr))] gap-3 overflow-x-auto pb-1" aria-label="Chỉ số chính">
        {cards.filter((card) => mainCardKeys.includes(card[2])).map(renderCard)}
      </section>

      <Tabs defaultValue="overview" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TabsList className="max-w-full shrink-0 self-start overflow-x-auto">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="finance">Tài chính</TabsTrigger>
          <TabsTrigger value="recent">Gần đây</TabsTrigger>
        </TabsList>
      <TabsContent value="overview" className="grid min-h-0 min-w-0 flex-1 grid-rows-[repeat(2,minmax(0,1fr))] gap-3 overflow-hidden data-[state=inactive]:hidden md:grid-cols-12 md:grid-rows-[minmax(0,1fr)]">
        <div style={{ animationDelay: "120ms" }} className="animate-rise flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain rounded-lg border bg-card p-3 backdrop-blur-md md:col-span-8">
          <div className="mb-2 flex shrink-0 flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-[15px] font-bold">Doanh thu & chi tiền</h2>
              <p className="font-mono text-[10px] text-muted-foreground">Theo kỳ đã chọn</p>
            </div>
            <Button variant="ghost" size="sm" asChild><Link to="/finance">Xem thu chi <ArrowRight /></Link></Button>
          </div>
          <div className="min-h-[120px] w-full flex-1">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }} barCategoryGap="25%" barGap={4}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={9} tick={chartAxisTick} />
                  <Tooltip formatter={(v: number) => formatMoney(Number(v))} contentStyle={chartTooltipStyle} />
                  <Bar dataKey="revenue" name="Doanh thu" fill="oklch(var(--primary))" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="expenses" name="Chi tiền" fill="oklch(var(--accent))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-md border border-dashed text-center text-muted-foreground"><div><Inbox className="mx-auto mb-2 size-6" /><p className="text-[12px]">{loading ? "Đang tải biểu đồ…" : data ? "Chưa có dữ liệu biểu đồ cho kỳ này" : "Chưa tải được dữ liệu biểu đồ"}</p></div></div>
            )}
          </div>
          <div className="mt-2 flex shrink-0 justify-end gap-3 font-mono text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" />Doanh thu</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-accent" />Chi tiền</span>
          </div>
        </div>

        <div style={{ animationDelay: "180ms" }} className="animate-rise flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain rounded-lg border bg-card p-3 backdrop-blur-md md:col-span-4">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2"><h2 className="font-display text-[15px] font-bold">Cần xử lý</h2><span className="rounded bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary">Công nợ & đơn hàng</span></div>
          <div className="shrink-0 space-y-2">
            <div className="rounded-md border-l-2 border-primary bg-primary/8 p-3"><p className="text-[13px] font-semibold">Công nợ phải thu</p><p className="text-[11px] text-muted-foreground">{data ? `${formatMoney(data.current.receivable)} đang chờ thu` : "Chưa có dữ liệu"}</p></div>
            <div className="rounded-md border-l-2 border-primary bg-primary/8 p-3"><p className="text-[13px] font-semibold">Công nợ phải trả</p><p className="text-[11px] text-muted-foreground">{data ? `${formatMoney(data.current.payable)} cần thanh toán` : "Chưa có dữ liệu"}</p></div>
            <div className="rounded-md border-l-2 border-primary bg-primary/8 p-3"><p className="text-[13px] font-semibold">Đơn chưa thanh toán gần đây</p><p className="text-[11px] text-muted-foreground">{!data ? "Chưa có dữ liệu" : pendingOrder ? `${pendingOrder.order_code || "Đơn hàng"} · ${formatMoney(Number(pendingOrder.total))}` : "Không có đơn chờ thanh toán"}</p></div>
          <Button variant="outline" className="mt-4 w-full" asChild><Link to="/debts">Kiểm tra công nợ</Link></Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="finance" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain data-[state=inactive]:hidden">
        <h2 className="font-display text-[15px] font-bold">Tài chính chi tiết</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.filter((card) => detailCardKeys.includes(card[2])).map(renderCard)}
        </div>
      </TabsContent>

      <TabsContent value="recent" className="grid min-h-0 min-w-0 flex-1 grid-rows-[repeat(2,minmax(0,1fr))] gap-3 overflow-hidden data-[state=inactive]:hidden md:grid-cols-2 md:grid-rows-[minmax(0,1fr)]">
        <RecentTable title="Đơn hàng gần đây" rows={(data?.recentOrders || []).slice(0, 5).map((o) => [o.order_code || "—", o.customer_name || "Khách lẻ", formatMoney(Number(o.total)), <span className={`rounded px-2 py-0.5 font-sans text-[10px] font-semibold ${paymentTone(o.payment_status)}`}>{paymentLabel(o.payment_status)}</span>])} />
        <RecentTable title="Hàng nhập gần đây" rows={(data?.recentPurchases || []).slice(0, 5).map((p) => [p.product_code || "—", p.product_name || "Sản phẩm", `${p.quantity} sp`, formatMoney(Number(p.total))])} />
      </TabsContent>
      </Tabs>
    </div>
  );
}

function paymentLabel(status: string) { return status === "paid" ? "Đã TT" : status === "partial" ? "TT một phần" : "Còn nợ"; }
function paymentTone(status: string) { return status === "paid" ? "bg-success/10 text-success" : status === "partial" ? "bg-accent/35 text-accent-foreground" : "bg-destructive/10 text-destructive"; }
function RecentTable({ title, rows }: { title: string; rows: ReactNode[][] }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card backdrop-blur-md">
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
