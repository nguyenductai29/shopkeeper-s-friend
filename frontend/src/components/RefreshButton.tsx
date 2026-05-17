import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type RefreshButtonProps = {
  loading?: boolean;
  onClick: () => void;
  label?: string;
};

export function RefreshButton({ loading = false, onClick, label = "Làm mới" }: RefreshButtonProps) {
  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={loading}>
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Đang tải..." : label}
    </Button>
  );
}
