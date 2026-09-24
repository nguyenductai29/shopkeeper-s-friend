import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, Trash2, Star, Eye } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { RefreshButton } from "@/components/RefreshButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";
import { invoiceTemplatesStore, paymentQrsStore, type EntityId, type InvoiceTemplate, type PaymentQr } from "@/lib/fileStore";
import { buildVietQrImageUrl, formatVietQrAddInfo } from "@/lib/vietqr";

function Inner() {
  const [items, setItems] = useState<InvoiceTemplate[]>([]);
  const [paymentQrs, setPaymentQrs] = useState<PaymentQr[]>([]);
  const [editing, setEditing] = useState<Partial<InvoiceTemplate> | null>(null);
  const [preview, setPreview] = useState<InvoiceTemplate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      const [templateList, qrList] = await Promise.all([
        invoiceTemplatesStore.list(),
        paymentQrsStore.list(),
      ]);
      setItems(templateList);
      setPaymentQrs(qrList);
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tải được mẫu hoá đơn";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (showLoading) setRefreshing(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (saving) return;
    if (!editing?.name) return toast.error("Cần nhập tên template");
    setSaving(true);
    try {
      if (editing.id) {
        await invoiceTemplatesStore.update(editing.id, editing);
      } else {
        await invoiceTemplatesStore.create({ ...editing, name: editing.name });
      }
      setEditing(null);
      toast.success("Đã lưu");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được mẫu hoá đơn");
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: EntityId) => {
    try {
      await invoiceTemplatesStore.setDefault(id);
      toast.success("Đã đặt làm mặc định");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không đặt được mẫu mặc định");
    }
  };

  const remove = async (id: EntityId) => {
    try {
      await invoiceTemplatesStore.remove(id);
      toast.success("Đã xoá");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không xoá được mẫu hoá đơn");
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden p-4 sm:p-5">
      <div className="flex shrink-0 animate-rise flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Tạo và quản lý template hoá đơn xuất ra</p>
          <h1 className="font-display text-[26px] font-extrabold">Mẫu hoá đơn</h1>
        </div>
        <div className="flex gap-2">
          <RefreshButton loading={refreshing} onClick={() => load(true)} />
          <Button onClick={() => setEditing({ name: "", is_default: false, payment_qr_id: null })}>
            <Plus /> Tạo mẫu mới
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-3 overflow-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {loadError && <div role="alert" className="col-span-full flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><span>{loadError}</span><Button size="sm" variant="outline" onClick={() => load(true)}>Thử lại</Button></div>}
        {!loadError && items.length === 0 && (
          <div className="col-span-full grid h-56 place-items-center rounded-lg border border-dashed text-center text-muted-foreground">
            <div>
              <FileText className="mx-auto mb-2 size-7" />
              <p className="text-sm">Chưa có mẫu hoá đơn nào</p>
            </div>
          </div>
        )}
        {items.map((t, index) => (
          <div
            key={t.id}
            className={cn(
              "flex animate-rise flex-col rounded-lg border bg-card p-4 backdrop-blur-md",
              t.is_default && "border-primary/40",
            )}
            style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
          >
            {(() => {
              const qr = t.payment_qr_id ? paymentQrs.find((item) => item.id === t.payment_qr_id) : null;
              return (
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex min-w-0 gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-bold">{t.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {t.shop_name || "—"}{qr ? ` - QR: ${qr.name}` : ""}
                  </p>
                </div>
              </div>
              {t.is_default && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                  <Star className="size-3 fill-current" /> Mặc định
                </span>
              )}
            </div>
              );
            })()}
            <p className="mb-4 line-clamp-2 min-h-9 text-[12px] text-muted-foreground">{t.footer_note || "Không có ghi chú"}</p>
            <div className="mt-auto flex gap-1.5 border-t pt-3">
              <Button size="sm" variant="outline" title="Xem trước hoá đơn" onClick={() => setPreview(t)}><Eye /></Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(t)}>Sửa</Button>
              {!t.is_default && <Button size="sm" variant="outline" title="Đặt làm mặc định" onClick={() => setDefault(t.id)}><Star /></Button>}
              <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive" title="Xoá" onClick={() => remove(t.id)}><Trash2 /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader><DialogTitle className="font-display">{editing?.id ? "Sửa mẫu" : "Tạo mẫu mới"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="min-h-0 space-y-3 overflow-auto">
              <div className="space-y-1.5"><Label>Tên mẫu *</Label><Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Tên shop</Label><Input value={editing.shop_name || ""} onChange={(e) => setEditing({ ...editing, shop_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Số điện thoại</Label><Input value={editing.shop_phone || ""} onChange={(e) => setEditing({ ...editing, shop_phone: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label>Địa chỉ</Label><Input value={editing.shop_address || ""} onChange={(e) => setEditing({ ...editing, shop_address: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Lời mở đầu</Label><Textarea rows={2} value={editing.header_note || ""} onChange={(e) => setEditing({ ...editing, header_note: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Lời cảm ơn / footer</Label><Textarea rows={2} value={editing.footer_note || ""} onChange={(e) => setEditing({ ...editing, footer_note: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>VietQR trong footer</Label>
                <Select
                  value={editing.payment_qr_id ? String(editing.payment_qr_id) : "none"}
                  onValueChange={(value) => setEditing({ ...editing, payment_qr_id: value === "none" ? null : paymentQrs.find((qr) => String(qr.id) === value)?.id ?? null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Không gắn QR" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Không gắn QR</SelectItem>
                    {paymentQrs.map((qr) => (
                      <SelectItem key={qr.id} value={String(qr.id)}>{qr.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => setEditing(null)}>Huỷ</Button>
                <Button onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader><DialogTitle className="font-display">Xem trước hoá đơn</DialogTitle></DialogHeader>
          {preview && (
            <div className="min-h-0 space-y-1 overflow-auto rounded-md border bg-white p-6 font-mono text-sm text-black shadow-sm">
              {(() => {
                const qr = preview.payment_qr_id ? paymentQrs.find((item) => item.id === preview.payment_qr_id) : null;
                const amount = qr?.fixed_amount || 350000;
                const addInfo = qr ? formatVietQrAddInfo(qr.add_info, { orderId: "mau", amount }) : "";
                return (
                  <>
              <div className="text-center text-lg font-bold">{preview.shop_name || "Tên shop"}</div>
              <div className="text-center text-xs">{preview.shop_address}</div>
              <div className="text-center text-xs">SĐT: {preview.shop_phone}</div>
              <div className="my-2 border-t border-dashed border-black/60" />
              <div className="text-center font-semibold">HOÁ ĐƠN BÁN HÀNG</div>
              {preview.header_note && <div className="text-xs italic">{preview.header_note}</div>}
              <div className="my-2 border-t border-dashed border-black/60" />
              <div>Sản phẩm A x 2 .... 200.000đ</div>
              <div>Sản phẩm B x 1 .... 150.000đ</div>
              <div className="my-2 border-t border-dashed border-black/60" />
              <div className="font-bold">Tổng: 350.000đ</div>
              <div className="my-2 border-t border-dashed border-black/60" />
              <div className="text-center text-xs italic">{preview.footer_note || "Cảm ơn quý khách!"}</div>
              {qr && (
                <div className="pt-2 text-center">
                  <img
                    src={buildVietQrImageUrl(qr, { amount, addInfo })}
                    alt={qr.name}
                    className="mx-auto h-36 w-36 object-contain"
                  />
                  <div className="mt-1 text-xs font-bold">{formatVND(amount)}</div>
                  <div className="text-[11px]">{qr.account_name || qr.name}</div>
                  <div className="text-[11px]">{qr.bank_bin} / {qr.account_no}</div>
                </div>
              )}
                  </>
                );
              })()}
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
