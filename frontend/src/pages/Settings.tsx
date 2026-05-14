import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Mail, MessageSquare, Hash, Save, Send, Store } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { notificationStore, settingsStore, type AppSettings } from "@/lib/fileStore";

const NOTIFICATION_REASON_LABEL: Record<string, string> = {
  missing_recipient: "thiếu email nhận",
  missing_smtp: "thiếu SMTP",
  missing_token: "thiếu token",
  missing_page: "thiếu page",
  missing_webhook: "thiếu webhook",
};

function Inner() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => { setS(await settingsStore.get()); })();
  }, []);

  const saveSettings = async () => {
    if (!s) return;
    const saved = await settingsStore.save(s);
    setS(saved);
    return saved;
  };

  const save = async () => {
    const saved = await saveSettings();
    if (!saved) return;
    toast.success("Đã lưu cài đặt");
  };

  const testNotifications = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const saved = await saveSettings();
      if (!saved) return;

      const result = await notificationStore.test();
      if (!result.results.length) {
        toast.error("Chưa cấu hình kênh thông báo");
        return;
      }

      const sent = result.results.filter((item) => item.sent).map((item) => item.channel);
      const failed = result.results.filter((item) => item.error);
      const skipped = result.results.filter((item) => item.skipped);

      if (sent.length) {
        toast.success(`Đã gửi thử: ${sent.join(", ")}`);
      }
      if (failed.length || skipped.length) {
        const channels = [...failed, ...skipped].map((item) => {
          const reason = item.reason ? NOTIFICATION_REASON_LABEL[item.reason] : null;
          return reason ? `${item.channel} (${reason})` : item.channel;
        }).join(", ");
        toast.error(`Chưa gửi được: ${channels}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi gửi thử thông báo");
    } finally {
      setTesting(false);
    }
  };

  if (!s) return <div className="text-muted-foreground">Đang tải...</div>;

  return (
    <div className="flex h-full min-h-0 max-w-3xl flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl md:text-3xl font-semibold">Cài đặt</h1>
        <p className="text-muted-foreground text-sm mt-1">Cài đặt thông báo và ứng dụng</p>
      </div>

      <Card className="shrink-0 p-4 shadow-elegant space-y-3">
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Thông tin cửa hàng</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Tên cửa hàng</Label><Input value={s.shop_name || ""} onChange={(e) => setS({ ...s, shop_name: e.target.value })} /></div>
          <div><Label>Đơn vị tiền</Label><Input value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} /></div>
          <div>
            <Label>Tỷ giá yên Nhật</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={s.jpy_to_vnd_rate}
              onChange={(e) => setS({ ...s, jpy_to_vnd_rate: Number(e.target.value) })}
              placeholder="VD: 170"
            />
            <div className="mt-1 text-xs text-muted-foreground">1 JPY = {s.jpy_to_vnd_rate || 0} VND</div>
          </div>
        </div>
      </Card>

      <Card className="shrink-0 p-4 shadow-elegant space-y-3">
        <h3 className="font-semibold">Kênh thông báo</h3>
        <div className="space-y-3">
          <div>
            <Label className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Email nhận thông báo</Label>
            <Input type="email" placeholder="ban@shop.com" value={s.notify_email || ""} onChange={(e) => setS({ ...s, notify_email: e.target.value })} />
          </div>
          <div>
            <Label className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Facebook (page ID / link)</Label>
            <Input placeholder="fb.com/your-page" value={s.notify_facebook || ""} onChange={(e) => setS({ ...s, notify_facebook: e.target.value })} />
          </div>
          <div>
            <Label className="flex items-center gap-2"><Hash className="w-4 h-4 text-primary" /> Discord webhook URL</Label>
            <Input placeholder="https://discord.com/api/webhooks/..." value={s.notify_discord_webhook || ""} onChange={(e) => setS({ ...s, notify_discord_webhook: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card className="shrink-0 p-4 shadow-elegant space-y-3">
        <h3 className="font-semibold">Loại thông báo</h3>
        <div className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2">
          <Label htmlFor="n1" className="cursor-pointer">Khi có đơn hàng mới</Label>
          <Switch id="n1" checked={s.notify_on_new_order} onCheckedChange={(v) => setS({ ...s, notify_on_new_order: v })} />
        </div>
        <div className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2">
          <Label htmlFor="n2" className="cursor-pointer">Khi sản phẩm sắp hết hàng</Label>
          <Switch id="n2" checked={s.notify_on_low_stock} onCheckedChange={(v) => setS({ ...s, notify_on_low_stock: v })} />
        </div>
      </Card>

      <div className="flex shrink-0 justify-end gap-2">
        <Button size="lg" variant="outline" onClick={testNotifications} disabled={testing}>
          <Send className="w-4 h-4 mr-2" /> {testing ? "Đang gửi..." : "Gửi thử"}
        </Button>
        <Button size="lg" onClick={save}><Save className="w-4 h-4 mr-2" /> Lưu cài đặt</Button>
      </div>
    </div>
  );
}

export default function Settings() {
  return <AdminGate><Inner /></AdminGate>;
}
