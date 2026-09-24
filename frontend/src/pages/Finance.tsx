import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, WalletCards, type LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Transaction = {
  id: string | number;
  direction: "IN" | "OUT";
  amount: number | string;
  occurred_at: string;
  description?: string | null;
  order_code?: string | null;
  type: string;
  currency?: string;
  category_name?: string | null;
};

export default function Finance() {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [currency, setCurrency] = useState("VND");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/finance/transactions');
      if (!response.ok) throw new Error(`Không tải được thu chi (${response.status})`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Dữ liệu thu chi không hợp lệ");
      setRows(data as Transaction[]);
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tải được thu chi";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const displayedRows = rows.filter((row) => (row.currency || "VND").toUpperCase() === currency);
  const income=displayedRows.filter(x=>x.direction==='IN').reduce((s,x)=>s+Number(x.amount||0),0);
  const expense=displayedRows.filter(x=>x.direction==='OUT').reduce((s,x)=>s+Number(x.amount||0),0);
  return <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden p-4 sm:p-5">
    <header className="animate-rise flex shrink-0 flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase text-muted-foreground">Sổ dòng tiền tập trung của cửa hàng.</p><h1 className="font-display text-[26px] font-extrabold">Thu & Chi</h1></div><select aria-label="Đơn vị tiền" value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="VND">VND</option><option value="JPY">JPY</option></select></header>
    {loadError && <div role="alert" className="flex shrink-0 items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><span>{loadError}</span><Button size="sm" variant="outline" disabled={loading} onClick={load}>Thử lại</Button></div>}
    {!(loadError && rows.length === 0) && <section className="grid shrink-0 grid-cols-3 gap-3"><Metric currency={currency} label="Tổng thu" value={income} icon={ArrowDownLeft} tone="text-success" index={0}/><Metric currency={currency} label="Tổng chi" value={expense} icon={ArrowUpRight} tone="text-destructive" index={1}/><Metric currency={currency} label="Dòng tiền ròng" value={income-expense} icon={WalletCards} tone="text-primary" index={2}/></section>}
    <section className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card backdrop-blur-md"><div className="h-full overflow-auto"><div className="min-w-[640px]"><div className="sticky top-0 z-10 grid grid-cols-[120px_90px_1fr_140px_130px] gap-3 bg-muted px-3 py-2.5 font-mono text-[9px] uppercase text-muted-foreground"><span>Ngày</span><span>Loại</span><span>Nội dung</span><span>Danh mục</span><span className="text-right">Số tiền</span></div><div className="divide-y">{displayedRows.map(x=><div key={x.id} className="grid grid-cols-[120px_90px_1fr_140px_130px] items-center gap-3 px-3 py-2.5 text-[12px] hover:bg-muted/40"><span className="font-mono">{new Date(x.occurred_at).toLocaleDateString('vi-VN')}</span><span className={`justify-self-start rounded px-2 py-1 text-[10px] font-semibold ${x.direction==='IN'?'bg-success/10 text-success':'bg-destructive/10 text-destructive'}`}>{x.direction==='IN'?'THU':'CHI'}</span><span className="truncate font-semibold">{x.description||x.order_code||x.type}</span><span className="truncate text-muted-foreground">{x.category_name||'—'}</span><span className="text-right font-mono font-semibold">{formatCurrency(Number(x.amount||0), x.currency || "VND")}</span></div>)}</div></div></div></section>
  </div>;
}
function Metric({label,value,currency,icon:Icon,tone,index}:{currency:string;label:string;value:number;icon:LucideIcon;tone:string;index:number}){return <div style={{animationDelay:`${index*60}ms`}} className="animate-rise min-w-0 rounded-lg border bg-card p-3 backdrop-blur-md sm:p-4"><div className="flex items-start justify-between gap-2"><p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p><Icon className={`size-4 shrink-0 ${tone}`}/></div><p className="mt-2 break-words font-display text-lg font-extrabold sm:text-2xl">{formatCurrency(value, currency)}</p></div>}
