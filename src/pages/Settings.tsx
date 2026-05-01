import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Mail, MessageSquare, Hash, Save, Store } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/AdminGate";

type Settings = {
  id?: string;
  notify_email: string | null;
  notify_facebook: string | null;
  notify_discord_webhook: string | null;
  notify_on_new_order: boolean;
  notify_on_low_stock: boolean;
  currency: string;
  shop_name: string | null;
};

function Inner() {
  const [s, setS] = useState<Settings | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("*").limit(1).maybeSingle();
      setS(data as any);
    })();
  }, []);

  const save = async () => {
    if (!s?.id) return;
    const { id, ...rest } = s;
    await supabase.from("app_settings").update(rest).eq("id", id);
    toast.success("Đã lưu cài đặt");
  };

  if (!s) return <div className="text-muted-foreground">Đang tải...</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Cài đặt</h1>
        <p className="text-muted-foreground text-sm mt-1">Cài đặt thông báo và ứng dụng</p>
      </div>

      <Card className="p-5 shadow-elegant space-y-4">
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Thông tin cửa hàng</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Tên cửa hàng</Label><Input value={s.shop_name || ""} onChange={(e) => setS({ ...s, shop_name: e.target.value })} /></div>
          <div><Label>Đơn vị tiền</Label><Input value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} /></div>
        </div>
      </Card>

      <Card className="p-5 shadow-elegant space-y-4">
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

      <Card className="p-5 shadow-elegant space-y-3">
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

      <div className="flex justify-end">
        <Button size="lg" onClick={save}><Save className="w-4 h-4 mr-2" /> Lưu cài đặt</Button>
      </div>
    </div>
  );
}

export default function Settings() {
  return <AdminGate><Inner /></AdminGate>;
}
