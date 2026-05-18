import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Hash, PackagePlus, ReceiptText, Save, Send, Store, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";
import { RefreshButton } from "@/components/RefreshButton";
import { notificationStore, settingsStore, type AppSettings } from "@/lib/fileStore";

const NOTIFICATION_REASON_LABEL: Record<string, string> = {
  missing_webhook: "thiếu webhook",
};

type ToggleKey = "notify_on_new_order" | "notify_on_purchase" | "notify_on_low_stock" | "notify_on_debt";
type WebhookKey =
  | "notify_discord_sales_webhook"
  | "notify_discord_purchase_webhook"
  | "notify_discord_low_stock_webhook"
  | "notify_discord_debt_webhook";

const DISCORD_CHANNELS: Array<{
  label: string;
  description: string;
  toggleKey: ToggleKey;
  webhookKey: WebhookKey;
  Icon: LucideIcon;
}> = [
  {
    label: "Quản lý bán hàng",
    description: "Gửi khi tạo đơn hàng mới",
    toggleKey: "notify_on_new_order",
    webhookKey: "notify_discord_sales_webhook",
    Icon: ReceiptText,
  },
  {
    label: "Nhập hàng",
    description: "Gửi khi lưu phiếu nhập hàng",
    toggleKey: "notify_on_purchase",
    webhookKey: "notify_discord_purchase_webhook",
    Icon: PackagePlus,
  },
  {
    label: "Hết hàng",
    description: "Gửi khi tồn kho xuống ngưỡng thấp",
    toggleKey: "notify_on_low_stock",
    webhookKey: "notify_discord_low_stock_webhook",
    Icon: AlertTriangle,
  },
  {
    label: "Công nợ",
    description: "Gửi khi phát sinh đơn chưa thanh toán",
    toggleKey: "notify_on_debt",
    webhookKey: "notify_discord_debt_webhook",
    Icon: Users,
  },
];

function Inner() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSettings = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      setS(await settingsStore.get());
    } finally {
      if (showLoading) setRefreshing(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

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

      const sent = result.results.filter((item) => item.sent).map((item) => item.label || item.channel);
      const failed = result.results.filter((item) => item.error);
      const skipped = result.results.filter((item) => item.skipped);

      if (sent.length) {
        toast.success(`Đã gửi thử: ${sent.join(", ")}`);
      }
      if (failed.length || skipped.length) {
        const channels = [...failed, ...skipped].map((item) => {
          const reason = item.reason ? NOTIFICATION_REASON_LABEL[item.reason] : null;
          const label = item.label || item.channel;
          return reason ? `${label} (${reason})` : label;
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
    <div className="flex h-full min-h-0 max-w-5xl flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Cài đặt</h1>
          <p className="text-muted-foreground text-sm mt-1">Cài đặt thông báo và ứng dụng</p>
        </div>
        <RefreshButton loading={refreshing} onClick={() => loadSettings(true)} />
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

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 shadow-elegant">
        <div className="mb-3 flex shrink-0 items-center gap-2">
          <Hash className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">Discord webhook theo nghiệp vụ</h3>
            <p className="text-xs text-muted-foreground">Mỗi dòng có thể trỏ tới một channel Discord khác nhau</p>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 overflow-auto pr-1 md:grid-cols-2">
          {DISCORD_CHANNELS.map(({ label, description, toggleKey, webhookKey, Icon }) => (
            <div key={webhookKey} className="rounded-md border bg-muted/20 p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <Label htmlFor={toggleKey} className="cursor-pointer font-medium">{label}</Label>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                </div>
                <Switch
                  id={toggleKey}
                  checked={Boolean(s[toggleKey])}
                  onCheckedChange={(value) => setS({ ...s, [toggleKey]: value })}
                />
              </div>
              <Input
                placeholder="https://discord.com/api/webhooks/..."
                value={s[webhookKey] || ""}
                onChange={(event) => setS({ ...s, [webhookKey]: event.target.value })}
              />
            </div>
          ))}
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
