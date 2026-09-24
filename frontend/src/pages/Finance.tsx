import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, WalletCards, type LucideIcon } from "lucide-react";
import { formatVND } from "@/lib/format";

export default function Finance() {
  const [rows,setRows]=useState<any[]>([]);
  useEffect(()=>{fetch('/api/finance/transactions').then(r=>r.json()).then(setRows).catch(()=>setRows([]))},[]);
  const income=rows.filter(x=>x.direction==='IN').reduce((s,x)=>s+Number(x.amount||0),0);
  const expense=rows.filter(x=>x.direction==='OUT').reduce((s,x)=>s+Number(x.amount||0),0);
  return <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 sm:p-5">
    <header className="animate-rise flex shrink-0 flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase text-muted-foreground">Sổ dòng tiền tập trung của cửa hàng.</p><h1 className="font-display text-[26px] font-extrabold">Thu & Chi</h1></div></header>
    <section className="grid shrink-0 gap-3 sm:grid-cols-3"><Metric label="Tổng thu" value={income} icon={ArrowDownLeft} tone="text-success" index={0}/><Metric label="Tổng chi" value={expense} icon={ArrowUpRight} tone="text-destructive" index={1}/><Metric label="Dòng tiền ròng" value={income-expense} icon={WalletCards} tone="text-primary" index={2}/></section>
    <section className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card backdrop-blur-md"><div className="h-full overflow-auto"><div className="min-w-[640px]"><div className="sticky top-0 z-10 grid grid-cols-[120px_90px_1fr_140px_130px] gap-3 bg-muted px-3 py-2.5 font-mono text-[9px] uppercase text-muted-foreground"><span>Ngày</span><span>Loại</span><span>Nội dung</span><span>Danh mục</span><span className="text-right">Số tiền</span></div><div className="divide-y">{rows.map(x=><div key={x.id} className="grid grid-cols-[120px_90px_1fr_140px_130px] items-center gap-3 px-3 py-2.5 text-[12px] hover:bg-muted/40"><span className="font-mono">{new Date(x.occurred_at).toLocaleDateString('vi-VN')}</span><span className={`justify-self-start rounded px-2 py-1 text-[10px] font-semibold ${x.direction==='IN'?'bg-success/10 text-success':'bg-destructive/10 text-destructive'}`}>{x.direction==='IN'?'THU':'CHI'}</span><span className="truncate font-semibold">{x.description||x.order_code||x.type}</span><span className="truncate text-muted-foreground">{x.category_name||'—'}</span><span className="text-right font-mono font-semibold">{formatVND(Number(x.amount||0))}</span></div>)}</div></div></div></section>
  </div>;
}
function Metric({label,value,icon:Icon,tone,index}:{label:string;value:number;icon:LucideIcon;tone:string;index:number}){return <div style={{animationDelay:`${index*60}ms`}} className="animate-rise min-w-0 rounded-lg border bg-card p-4 backdrop-blur-md"><div className="flex items-start justify-between gap-2"><p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p><Icon className={`size-4 shrink-0 ${tone}`}/></div><p className="mt-2 truncate font-display text-2xl font-extrabold">{formatVND(value)}</p></div>}
