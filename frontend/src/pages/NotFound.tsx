import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-background p-4">
      <div className="animate-rise m-auto max-h-full w-full max-w-md overflow-auto text-center">
        <h1 className="font-display text-7xl font-extrabold text-foreground">404</h1>
        <h2 className="mt-4 font-display text-xl font-bold text-foreground">Không tìm thấy trang</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trang bạn đang tìm không tồn tại hoặc đã được di chuyển.
        </p>
        <div className="mt-6">
          <Button asChild>
            <a href="/">Về trang chủ</a>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
