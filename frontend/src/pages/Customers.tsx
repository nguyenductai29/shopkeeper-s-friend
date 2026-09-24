import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

type Customer = {
  id: string | number;
  customer_code: string;
  name: string;
  phone?: string | null;
  order_count?: number | string;
  lifetime_revenue?: number | string;
};

export default function Customers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [currency, setCurrency] = useState("VND");
  const requestId = useRef(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async (query = "", selectedCurrency = "VND") => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ currency: selectedCurrency });
      if (query) params.set("q", query);
      const response = await fetch(`/api/customers?${params}`);
      if (!response.ok) throw new Error(`Không tải được khách hàng (${response.status})`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Dữ liệu khách hàng không hợp lệ");
      if (id !== requestId.current) return;
      setRows(data as Customer[]);
      setLoadError(null);
    } catch (error) {
      if (id !== requestId.current) return;
      const message = error instanceof Error ? error.message : "Không tải được khách hàng";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden p-4 sm:p-5">
    <header className="animate-rise flex shrink-0 flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase text-muted-foreground">Theo dõi khách, số đơn, doanh thu và công nợ.</p><h1 className="font-display text-[26px] font-extrabold">Khách hàng</h1></div><select aria-label="Đơn vị tiền" value={currency} onChange={(event) => { const next = event.target.value; setCurrency(next); setRows([]); void load(q, next); }} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="VND">VND</option><option value="JPY">JPY</option></select></header>
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card backdrop-blur-md">
      <div className="flex shrink-0 flex-wrap gap-2 border-b p-3"><label className="flex h-9 min-w-52 flex-1 items-center gap-2 rounded-md border bg-background px-3"><Search className="size-4 text-muted-foreground"/><input className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!loading&&load(q, currency)} placeholder="Tìm tên hoặc số điện thoại"/></label><Button onClick={() => load(q, currency)} disabled={loading}><Search/>{loading ? "Đang tải..." : "Tìm"}</Button></div>
      {loadError && <div role="alert" className="flex shrink-0 items-center justify-between gap-3 border-b bg-destructive/10 p-3 text-sm text-destructive"><span>{loadError}</span><Button size="sm" variant="outline" disabled={loading} onClick={() => load(q, currency)}>Thử lại</Button></div>}
      <div className="min-h-0 flex-1 overflow-auto"><div className="min-w-[600px]"><div className="sticky top-0 z-10 grid grid-cols-[110px_1.4fr_1fr_100px_140px] gap-3 bg-muted px-3 py-2.5 font-mono text-[9px] uppercase text-muted-foreground"><span>Mã KH</span><span>Tên</span><span>Điện thoại</span><span className="text-right">Số đơn</span><span className="text-right">Doanh thu</span></div><div className="divide-y">{rows.map(c=><div key={c.id} className="grid grid-cols-[110px_1.4fr_1fr_100px_140px] items-center gap-3 px-3 py-2.5 text-[12px] hover:bg-muted/40"><span className="truncate font-mono">{c.customer_code}</span><span className="truncate font-semibold">{c.name}</span><span className="truncate font-mono">{c.phone||'—'}</span><span className="text-right font-mono">{Number(c.order_count||0)}</span><span className="text-right font-mono font-semibold">{formatCurrency(Number(c.lifetime_revenue||0), currency)}</span></div>)}</div></div></div>
    </section>
  </div>;
}
