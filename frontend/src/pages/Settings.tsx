import { useEffect, useState } from "react";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    try {
      setS(await settingsStore.get());
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không tải được cài đặt";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (showLoading) setRefreshing(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const saveSettings = async () => {
    if (!s) return;
    const rate = Number(s.jpy_to_vnd_rate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Tỷ giá JPY/VND phải là số lớn hơn 0");
    const saved = await settingsStore.save({ ...s, jpy_to_vnd_rate: rate });
    setS(saved);
    setLoadError(null);
    return saved;
  };

  const save = async () => {
    if (saving || testing) return;
    setSaving(true);
    try {
      const saved = await saveSettings();
      if (saved) toast.success("Đã lưu cài đặt");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được cài đặt");
    } finally {
      setSaving(false);
    }
  };

  const testNotifications = async () => {
    if (testing || saving) return;
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

  if (!s) return <div className="h-full min-h-0 overflow-auto p-4 text-sm text-muted-foreground sm:p-5">{loadError ? <div role="alert" className="space-y-3"><p>{loadError}</p><Button onClick={() => loadSettings(true)} disabled={refreshing}>Thử lại</Button></div> : "Đang tải..."}</div>;

  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-5xl flex-col gap-4 overflow-hidden p-4 sm:p-5">
      <div className="flex shrink-0 animate-rise flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Cài đặt thông báo và ứng dụng</p>
          <h1 className="font-display text-[26px] font-extrabold">Cài đặt</h1>
        </div>
        <RefreshButton loading={refreshing} onClick={() => loadSettings(true)} />
      </div>

      {loadError && <div role="alert" className="flex shrink-0 items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><span>{loadError}</span><Button size="sm" variant="outline" onClick={() => loadSettings(true)}>Thử lại</Button></div>}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:grid-rows-1">
        <section
          className="flex min-h-0 min-w-0 animate-rise flex-col overflow-hidden rounded-lg border bg-card p-4 backdrop-blur-md"
          style={{ animationDelay: "60ms" }}
        >
          <div className="mb-4 flex shrink-0 items-start gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Store className="size-4" />
            </div>
            <h2 className="self-center font-display text-[15px] font-bold">Thông tin cửa hàng</h2>
          </div>
          <div className="grid min-h-0 content-start gap-3 overflow-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-1.5"><Label className="text-[13px] font-semibold">Tên cửa hàng</Label><Input className="bg-background" value={s.shop_name || ""} onChange={(e) => setS({ ...s, shop_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-[13px] font-semibold">Đơn vị tiền</Label><Input className="bg-background font-mono" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Tỷ giá yên Nhật</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={s.jpy_to_vnd_rate}
                onChange={(e) => setS({ ...s, jpy_to_vnd_rate: Number(e.target.value) })}
                placeholder="VD: 170"
                className="bg-background font-mono"
              />
              <p className="font-mono text-[11px] text-muted-foreground">1 JPY = {s.jpy_to_vnd_rate || 0} VND</p>
            </div>
          </div>
        </section>

        <section
          className="flex min-h-0 min-w-0 animate-rise flex-col overflow-hidden rounded-lg border bg-card p-4 backdrop-blur-md"
          style={{ animationDelay: "120ms" }}
        >
          <div className="mb-4 flex shrink-0 items-start gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Hash className="size-4" />
            </div>
            <div>
              <h2 className="font-display text-[15px] font-bold">Discord webhook theo nghiệp vụ</h2>
              <p className="font-mono text-[10px] text-muted-foreground">Mỗi dòng có thể trỏ tới một channel Discord khác nhau</p>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 content-start gap-3 overflow-auto pr-1 md:grid-cols-2 lg:grid-cols-1">
            {DISCORD_CHANNELS.map(({ label, description, toggleKey, webhookKey, Icon }) => (
              <div key={webhookKey} className="rounded-lg border bg-background/70 p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor={toggleKey} className="cursor-pointer text-[13px] font-semibold">{label}</Label>
                      <p className="text-[11px] text-muted-foreground">{description}</p>
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
                  className="bg-background font-mono text-xs md:text-xs"
                />
              </div>
            ))}
          </div>
        </section>

      </div>

      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button size="lg" variant="outline" onClick={testNotifications} disabled={testing || saving}>
          <Send />
          {testing ? "Đang gửi..." : "Gửi thử"}
        </Button>
        <Button size="lg" onClick={save} disabled={saving || testing}>
          <Save />
          {saving ? "Đang lưu..." : "Lưu cài đặt"}
        </Button>
      </div>
    </div>
  );
}

export default function Settings() {
  return <AdminGate><Inner /></AdminGate>;
}
