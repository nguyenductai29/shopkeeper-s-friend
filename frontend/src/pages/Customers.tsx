import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatVND } from "@/lib/format";

export default function Customers() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const load = async () => {
    const r = await fetch(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (r.ok) setRows(await r.json());
  };
  useEffect(() => { load(); }, []);
  return <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 sm:p-5">
    <header className="animate-rise flex shrink-0 flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase text-muted-foreground">Theo dõi khách, số đơn, doanh thu và công nợ.</p><h1 className="font-display text-[26px] font-extrabold">Khách hàng</h1></div></header>
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card backdrop-blur-md">
      <div className="flex shrink-0 flex-wrap gap-2 border-b p-3"><label className="flex h-9 min-w-52 flex-1 items-center gap-2 rounded-md border bg-background px-3"><Search className="size-4 text-muted-foreground"/><input className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()} placeholder="Tìm tên hoặc số điện thoại"/></label><Button onClick={load}><Search/>Tìm</Button></div>
      <div className="min-h-0 flex-1 overflow-auto"><div className="min-w-[600px]"><div className="sticky top-0 z-10 grid grid-cols-[110px_1.4fr_1fr_100px_140px] gap-3 bg-muted px-3 py-2.5 font-mono text-[9px] uppercase text-muted-foreground"><span>Mã KH</span><span>Tên</span><span>Điện thoại</span><span className="text-right">Số đơn</span><span className="text-right">Doanh thu</span></div><div className="divide-y">{rows.map(c=><div key={c.id} className="grid grid-cols-[110px_1.4fr_1fr_100px_140px] items-center gap-3 px-3 py-2.5 text-[12px] hover:bg-muted/40"><span className="truncate font-mono">{c.customer_code}</span><span className="truncate font-semibold">{c.name}</span><span className="truncate font-mono">{c.phone||'—'}</span><span className="text-right font-mono">{Number(c.order_count||0)}</span><span className="text-right font-mono font-semibold">{formatVND(Number(c.lifetime_revenue||0))}</span></div>)}</div></div></div>
    </section>
  </div>;
}
