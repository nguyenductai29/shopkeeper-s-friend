import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatVND } from "@/lib/format";

export default function Customers() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const load = async () => {
    const r = await fetch(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (r.ok) setRows(await r.json());
  };
  useEffect(() => { load(); }, []);
  return <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
    <header className="shrink-0"><h1 className="text-2xl font-semibold">Khách hàng</h1><p className="text-xs text-muted-foreground">Theo dõi khách, số đơn, doanh thu và công nợ.</p></header>
    <div className="flex shrink-0 gap-2"><input className="h-9 flex-1 rounded-md border bg-background px-3 text-sm" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()} placeholder="Tìm tên hoặc số điện thoại"/><button className="rounded-md bg-primary px-4 text-sm text-primary-foreground" onClick={load}>Tìm</button></div>
    <Card className="min-h-0 flex-1 overflow-hidden p-3"><div className="grid grid-cols-[110px_1.4fr_1fr_100px_140px] gap-3 border-b pb-2 text-xs font-medium text-muted-foreground"><span>Mã KH</span><span>Tên</span><span>Điện thoại</span><span className="text-right">Số đơn</span><span className="text-right">Doanh thu</span></div><div className="h-[calc(100%-28px)] overflow-auto">{rows.map(c=><div key={c.id} className="grid grid-cols-[110px_1.4fr_1fr_100px_140px] gap-3 border-b py-2 text-sm"><span>{c.customer_code}</span><span className="truncate font-medium">{c.name}</span><span>{c.phone||'—'}</span><span className="text-right">{Number(c.order_count||0)}</span><span className="text-right">{formatVND(Number(c.lifetime_revenue||0))}</span></div>)}</div></Card>
  </div>;
}
