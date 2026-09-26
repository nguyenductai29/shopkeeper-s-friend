import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatVND } from "@/lib/format";

export default function Finance() {
  const [rows,setRows]=useState<any[]>([]);
  useEffect(()=>{fetch('/api/finance/transactions').then(r=>r.json()).then(setRows).catch(()=>setRows([]))},[]);
  const income=rows.filter(x=>x.direction==='IN').reduce((s,x)=>s+Number(x.amount||0),0);
  const expense=rows.filter(x=>x.direction==='OUT').reduce((s,x)=>s+Number(x.amount||0),0);
  return <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
    <header className="shrink-0"><h1 className="font-display text-[26px] font-extrabold leading-tight">Thu & Chi</h1><p className="text-xs text-muted-foreground">Sổ dòng tiền tập trung của cửa hàng.</p></header>
    <div className="grid shrink-0 grid-cols-3 gap-3"><Metric label="Tổng thu" value={income}/><Metric label="Tổng chi" value={expense}/><Metric label="Dòng tiền ròng" value={income-expense}/></div>
    <Card className="min-h-0 flex-1 overflow-hidden p-3"><div className="grid grid-cols-[120px_90px_1fr_140px_130px] gap-3 border-b pb-2 text-xs font-medium text-muted-foreground"><span>Ngày</span><span>Loại</span><span>Nội dung</span><span>Danh mục</span><span className="text-right">Số tiền</span></div><div className="h-[calc(100%-28px)] overflow-auto">{rows.map(x=><div key={x.id} className="grid grid-cols-[120px_90px_1fr_140px_130px] gap-3 border-b py-2 text-sm"><span>{new Date(x.occurred_at).toLocaleDateString('vi-VN')}</span><span className={x.direction==='IN'?'text-success':'text-destructive'}>{x.direction==='IN'?'THU':'CHI'}</span><span className="truncate">{x.description||x.order_code||x.type}</span><span className="truncate text-muted-foreground">{x.category_name||'—'}</span><span className="text-right font-medium">{formatVND(Number(x.amount||0))}</span></div>)}</div></Card>
  </div>;
}
function Metric({label,value}:{label:string;value:number}){return <Card className="p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{formatVND(value)}</div></Card>}
