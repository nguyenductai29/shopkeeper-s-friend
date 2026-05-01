import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScanLine, Save, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { formatVND } from "@/lib/format";
import { AdminGate } from "@/components/AdminGate";
import { productsStore, purchasesStore } from "@/lib/localStore";

type Row = {
  key: string;
  product_id: string | null;
  code: string;
  name: string;
  image_url: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
};

function ImportPageInner() {
  const [scan, setScan] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    const p = productsStore.findByCode(code);
    setRows((r) => [
      ...r,
      {
        key: crypto.randomUUID(),
        product_id: p?.id || null,
        code,
        name: p?.name || "",
        image_url: p?.image_url || "",
        cost_price: p?.cost_price || 0,
        sale_price: p?.sale_price || 0,
        quantity: 1,
      },
    ]);
    setScan("");
    scanRef.current?.focus();
  };

  const update = (key: string, field: keyof Row, value: any) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const totalCost = rows.reduce((s, r) => s + Number(r.cost_price) * Number(r.quantity), 0);

  const save = () => {
    if (rows.length === 0) return toast.error("Chưa có hàng nào");
    for (const r of rows) {
      if (!r.code || !r.name) return toast.error("Cần điền đủ mã & tên sản phẩm");
    }
    setSaving(true);
    try {
      for (const r of rows) {
        productsStore.upsertByCode({
          code: r.code,
          name: r.name,
          image_url: r.image_url || null,
          cost_price: r.cost_price,
          sale_price: r.sale_price,
          stock: r.quantity,
          addStock: r.quantity,
        });
        purchasesStore.add({
          product_id: r.product_id,
          product_code: r.code,
          product_name: r.name,
          cost_price: r.cost_price,
          sale_price: r.sale_price,
          quantity: r.quantity,
          total: Number(r.cost_price) * Number(r.quantity),
        });
      }
      toast.success(`Đã nhập ${rows.length} mặt hàng`);
      setRows([]);
    } catch {
      toast.error("Lỗi khi lưu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Nhập hàng</h1>
        <p className="text-muted-foreground text-sm mt-1">Quét hoặc nhập mã, sau đó điền thông tin & lưu</p>
      </div>

      <Card className="p-4 shadow-elegant">
        <form onSubmit={handleScan} className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
            <Input
              ref={scanRef}
              autoFocus
              placeholder="Quét hoặc nhập mã sản phẩm..."
              className="pl-9 h-11"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg">Thêm dòng</Button>
        </form>
      </Card>

      <Card className="shadow-elegant overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ảnh</TableHead>
                <TableHead className="w-24">Mã</TableHead>
                <TableHead className="min-w-[160px]">Tên SP</TableHead>
                <TableHead className="w-48">URL ảnh</TableHead>
                <TableHead className="w-32">Giá nhập</TableHead>
                <TableHead className="w-32">Giá bán</TableHead>
                <TableHead className="w-24">SL</TableHead>
                <TableHead className="w-32 text-right">Thành tiền</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    Chưa có hàng nhập. Quét mã ở phía trên.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    <div className="w-10 h-10 rounded bg-muted overflow-hidden flex items-center justify-center">
                      {r.image_url ? <img src={r.image_url} className="w-full h-full object-cover" alt="" /> : <Package className="w-4 h-4 text-muted-foreground/40" />}
                    </div>
                  </TableCell>
                  <TableCell><Input value={r.code} onChange={(e) => update(r.key, "code", e.target.value)} className="h-9" /></TableCell>
                  <TableCell><Input value={r.name} onChange={(e) => update(r.key, "name", e.target.value)} className="h-9" /></TableCell>
                  <TableCell><Input value={r.image_url} onChange={(e) => update(r.key, "image_url", e.target.value)} className="h-9" placeholder="https://..." /></TableCell>
                  <TableCell><Input type="number" value={r.cost_price} onChange={(e) => update(r.key, "cost_price", Number(e.target.value))} className="h-9" /></TableCell>
                  <TableCell><Input type="number" value={r.sale_price} onChange={(e) => update(r.key, "sale_price", Number(e.target.value))} className="h-9" /></TableCell>
                  <TableCell><Input type="number" value={r.quantity} onChange={(e) => update(r.key, "quantity", Number(e.target.value))} className="h-9" /></TableCell>
                  <TableCell className="text-right font-medium">{formatVND(r.cost_price * r.quantity)}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.key)} className="text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length > 0 && (
          <div className="border-t p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-lg">Tổng nhập: <span className="font-semibold text-primary">{formatVND(totalCost)}</span></div>
            <Button onClick={save} disabled={saving} size="lg">
              <Save className="w-4 h-4 mr-2" /> {saving ? "Đang lưu..." : "Lưu nhập kho"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ImportPage() {
  return <AdminGate><ImportPageInner /></AdminGate>;
}
