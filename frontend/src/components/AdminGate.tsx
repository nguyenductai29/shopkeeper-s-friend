import { useState } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, unlock } = useAdmin();
  const [pwd, setPwd] = useState("");

  if (isAdmin) return <>{children}</>;

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md p-8 shadow-elegant">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center mb-4 shadow-glow">
            <Lock className="w-6 h-6 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-semibold">Khu vực quản trị</h2>
          <p className="text-muted-foreground text-sm mt-1">Nhập mật khẩu để tiếp tục</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (unlock(pwd)) toast.success("Đã mở khoá quản trị");
            else toast.error("Mật khẩu không đúng");
          }}
          className="space-y-3"
        >
          <Input
            type="password"
            placeholder="Mật khẩu admin"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            autoFocus
          />
          <Button type="submit" className="w-full">
            <ShieldCheck className="w-4 h-4 mr-2" /> Mở khoá
          </Button>
        </form>
      </Card>
    </div>
  );
}
