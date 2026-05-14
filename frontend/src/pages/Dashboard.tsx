import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatVND, formatNumber } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, ShoppingBag, Package, AlertCircle } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ordersStore, productsStore, type Order } from "@/lib/fileStore";

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [unpaidCount, setUnpaidCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      const since = subDays(new Date(), 29).toISOString();
      const [recentOrders, count, unpaidCount] = await Promise.all([
        ordersStore.listSince(since),
        productsStore.count(),
        ordersStore.unpaidCount(),
      ]);
      if (cancelled) return;
      setOrders(recentOrders);
      setProductCount(count);
      setUnpaidCount(unpaidCount);
    };

    loadDashboard();
    const intervalId = window.setInterval(loadDashboard, 5000);
    window.addEventListener("focus", loadDashboard);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", loadDashboard);
    };
  }, []);

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalCost = orders.reduce((s, o) => s + Number(o.cost_total), 0);
  const profit = totalRevenue - totalCost;

  const days = Array.from({ length: 30 }).map((_, i) => {
    const d = startOfDay(subDays(new Date(), 29 - i));
    return { date: d, label: format(d, "dd/MM"), revenue: 0, cost: 0 };
  });
  orders.forEach((o) => {
    const day = format(startOfDay(new Date(o.created_at)), "dd/MM");
    const slot = days.find((d) => d.label === day);
    if (slot) {
      slot.revenue += Number(o.total);
      slot.cost += Number(o.cost_total);
    }
  });

  const stats = [
    { label: "Doanh thu (30d)", value: formatVND(totalRevenue), icon: Wallet, color: "text-primary", bg: "bg-accent" },
    { label: "Tiền nhập (30d)", value: formatVND(totalCost), icon: TrendingDown, color: "text-warning", bg: "bg-warning/10" },
    { label: "Lợi nhuận (30d)", value: formatVND(profit), icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
    { label: "Số sản phẩm", value: formatNumber(productCount), icon: Package, color: "text-primary", bg: "bg-accent" },
    { label: "Đơn chưa TT", value: formatNumber(unpaidCount), icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Tổng đơn (30d)", value: formatNumber(orders.length), icon: ShoppingBag, color: "text-primary", bg: "bg-accent" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl md:text-3xl font-semibold">Bảng điều khiển</h1>
        <p className="text-muted-foreground text-sm mt-1">Tổng quan doanh thu 30 ngày gần nhất</p>
      </div>

      <div className="grid shrink-0 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 shadow-elegant hover:shadow-glow transition-shadow">
            <div className={`w-8 h-8 rounded-md ${s.bg} ${s.color} flex items-center justify-center mb-2`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-lg font-semibold mt-1 truncate">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid flex-1 min-h-0 grid-rows-2 gap-3">
        <Card className="flex min-h-0 flex-col p-4 shadow-elegant">
          <h3 className="mb-2 shrink-0 font-semibold">Doanh thu vs Chi phí nhập</h3>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}
                  tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}k` : v}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => formatVND(v)}
                />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="hsl(var(--primary))" fill="url(#rev)" strokeWidth={2} />
                <Area type="monotone" dataKey="cost" name="Tiền nhập" stroke="hsl(var(--warning))" fill="url(#cost)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col p-4 shadow-elegant">
          <h3 className="mb-2 shrink-0 font-semibold">Lợi nhuận theo ngày</h3>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days.map((d) => ({ ...d, profit: d.revenue - d.cost }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}
                  tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}k` : v}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => formatVND(v)}
                />
                <Bar dataKey="profit" name="Lợi nhuận" fill="hsl(var(--success))" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
