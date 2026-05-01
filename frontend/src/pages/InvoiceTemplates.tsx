import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Trash2, Star, Eye } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invoiceTemplatesStore, type InvoiceTemplate } from "@/lib/fileStore";

function Inner() {
  const [items, setItems] = useState<InvoiceTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<InvoiceTemplate> | null>(null);
  const [preview, setPreview] = useState<InvoiceTemplate | null>(null);

  const load = async () => setItems(await invoiceTemplatesStore.list());
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name) return toast.error("Cần nhập tên template");
    if (editing.id) {
      await invoiceTemplatesStore.update(editing.id, editing);
    } else {
      await invoiceTemplatesStore.create({ ...editing, name: editing.name });
    }
    setEditing(null);
    toast.success("Đã lưu");
    load();
  };

  const setDefault = async (id: string) => {
    await invoiceTemplatesStore.setDefault(id);
    toast.success("Đã đặt làm mặc định");
    load();
  };

  const remove = async (id: string) => {
    await invoiceTemplatesStore.remove(id);
    toast.success("Đã xoá");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Mẫu hoá đơn</h1>
          <p className="text-muted-foreground text-sm mt-1">Tạo và quản lý template hoá đơn xuất ra</p>
        </div>
        <Button onClick={() => setEditing({ name: "", is_default: false })}>
          <Plus className="w-4 h-4 mr-2" /> Tạo mẫu mới
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.length === 0 && (
          <Card className="col-span-full p-12 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
            Chưa có mẫu hoá đơn nào
          </Card>
        )}
        {items.map((t) => (
          <Card key={t.id} className="p-4 shadow-elegant gradient-card">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{t.name}</div>
                <div className="text-xs text-muted-foreground truncate">{t.shop_name || "—"}</div>
              </div>
              {t.is_default && <Badge variant="default"><Star className="w-3 h-3 mr-1" /> Mặc định</Badge>}
            </div>
            <div className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{t.footer_note || "Không có ghi chú"}</div>
            <div className="flex gap-1 mt-3">
              <Button size="sm" variant="outline" onClick={() => setPreview(t)}><Eye className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(t)}>Sửa</Button>
              {!t.is_default && <Button size="sm" variant="outline" onClick={() => setDefault(t.id)}><Star className="w-3.5 h-3.5" /></Button>}
              <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => remove(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Sửa mẫu" : "Tạo mẫu mới"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Tên mẫu *</Label><Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><Label>Tên shop</Label><Input value={editing.shop_name || ""} onChange={(e) => setEditing({ ...editing, shop_name: e.target.value })} /></div>
                <div><Label>Số điện thoại</Label><Input value={editing.shop_phone || ""} onChange={(e) => setEditing({ ...editing, shop_phone: e.target.value })} /></div>
              </div>
              <div><Label>Địa chỉ</Label><Input value={editing.shop_address || ""} onChange={(e) => setEditing({ ...editing, shop_address: e.target.value })} /></div>
              <div><Label>Lời mở đầu</Label><Textarea rows={2} value={editing.header_note || ""} onChange={(e) => setEditing({ ...editing, header_note: e.target.value })} /></div>
              <div><Label>Lời cảm ơn / footer</Label><Textarea rows={2} value={editing.footer_note || ""} onChange={(e) => setEditing({ ...editing, footer_note: e.target.value })} /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Huỷ</Button>
                <Button onClick={save}>Lưu</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Xem trước hoá đơn</DialogTitle></DialogHeader>
          {preview && (
            <div className="bg-white text-black p-6 rounded font-mono text-sm space-y-1 border">
              <div className="text-center font-bold text-lg">{preview.shop_name || "Tên shop"}</div>
              <div className="text-center text-xs">{preview.shop_address}</div>
              <div className="text-center text-xs">SĐT: {preview.shop_phone}</div>
              <div className="border-t border-dashed my-2" />
              <div className="text-center font-semibold">HOÁ ĐƠN BÁN HÀNG</div>
              {preview.header_note && <div className="text-xs italic">{preview.header_note}</div>}
              <div className="border-t border-dashed my-2" />
              <div>Sản phẩm A x 2 .... 200.000đ</div>
              <div>Sản phẩm B x 1 .... 150.000đ</div>
              <div className="border-t border-dashed my-2" />
              <div className="font-bold">Tổng: 350.000đ</div>
              <div className="border-t border-dashed my-2" />
              <div className="text-center text-xs italic">{preview.footer_note || "Cảm ơn quý khách!"}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function InvoiceTemplates() {
  return <AdminGate><Inner /></AdminGate>;
}
