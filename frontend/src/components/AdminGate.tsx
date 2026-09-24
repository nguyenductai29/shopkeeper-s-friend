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
    <div className="flex h-full min-h-0 overflow-y-auto p-4 sm:p-5">
      <Card className="animate-rise m-auto w-full max-w-md p-8 backdrop-blur-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-lg bg-primary/10 text-primary">
            <Lock className="size-5" />
          </div>
          <h2 className="font-display text-[22px] font-extrabold">Khu vực quản trị</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nhập mật khẩu để tiếp tục</p>
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
            <ShieldCheck />
            Mở khoá
          </Button>
        </form>
      </Card>
    </div>
  );
}
