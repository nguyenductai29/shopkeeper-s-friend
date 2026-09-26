import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  BarChart3,
  FileText,
  HandCoins,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  PackagePlus,
  QrCode,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/contexts/AdminContext";
import { useShopName } from "@/hooks/useShopName";
import { ordersStore, productsStore } from "@/lib/fileStore";

// Layout ported from the shopkeeper-s-best-friend redesign (src/components/app-shell.tsx).

type NavItem = { label: string; icon: LucideIcon; to: string; admin?: boolean };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Vận hành",
    items: [
      { label: "Tổng quan", icon: LayoutDashboard, to: "/" },
      { label: "Bán hàng (POS)", icon: ShoppingCart, to: "/pos" },
      { label: "Đơn hàng", icon: ReceiptText, to: "/sales", admin: true },
      { label: "Nhập hàng", icon: PackagePlus, to: "/import", admin: true },
      { label: "Khách hàng", icon: Users, to: "/customers" },
    ],
  },
  {
    label: "Quản trị",
    items: [
      { label: "Thu & Chi", icon: BarChart3, to: "/finance" },
      { label: "Công nợ", icon: HandCoins, to: "/debts", admin: true },
      { label: "Mẫu hóa đơn", icon: FileText, to: "/invoice-templates", admin: true },
      { label: "VietQR", icon: QrCode, to: "/payment-qrs", admin: true },
      { label: "Cài đặt", icon: Settings, to: "/settings", admin: true },
    ],
  },
];

// Same default as the backend's LOW_STOCK_THRESHOLD for low-stock notifications.
const LOW_STOCK_THRESHOLD = 5;
const COLLAPSED_KEY = "shopflow:sidebar-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function useAlerts(pathname: string) {
  const [alerts, setAlerts] = useState({ lowStock: 0, unpaid: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [products, unpaid] = await Promise.all([
        productsStore.list().catch(() => null),
        ordersStore.unpaidCount().catch(() => null),
      ]);
      if (cancelled) return;
      setAlerts((current) => ({
        lowStock: products
          ? products.filter((product) => Number(product.stock || 0) <= LOW_STOCK_THRESHOLD).length
          : current.lowStock,
        unpaid: unpaid ?? current.unpaid,
      }));
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pathname]);

  return alerts;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin, lock } = useAdmin();
  const shopName = useShopName();
  const alerts = useAlerts(pathname);
  const now = useClock();
  const alertCount = alerts.lowStock + alerts.unpaid;

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1");
      } catch {
        // Remembering the sidebar state is optional.
      }
      return !value;
    });
  };

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    navigate(`/pos?q=${encodeURIComponent(query)}`);
    setSearch("");
    searchRef.current?.blur();
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      <aside
        className={`${collapsed ? "w-16" : "w-[248px]"} flex h-full shrink-0 flex-col border-r bg-card/90 backdrop-blur-md transition-[width] duration-300`}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b px-3.5">
          <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border bg-white">
            <img src="/imo_kome_authentic_logo.svg" alt={shopName} className="size-full object-contain p-0.5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate font-display text-[15px] font-bold">{shopName}</p>
              <p className="truncate font-mono text-[9px] uppercase text-muted-foreground">Quản lý bán hàng</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 text-[13px]">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-3">
              {!collapsed && (
                <p className="px-2.5 pb-1.5 pt-1 font-mono text-[10px] uppercase text-muted-foreground">{group.label}</p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const badge = item.to === "/debts" && alerts.unpaid > 0 ? alerts.unpaid : null;
                  const locked = item.admin && !isAdmin;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex h-9 w-full items-center rounded-md transition-colors ${
                          collapsed ? "justify-center" : "gap-2.5 px-2.5"
                        } ${isActive ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`
                      }
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate font-medium">{item.label}</span>}
                      {!collapsed && badge !== null && (
                        <span className="ml-auto rounded bg-accent/35 px-1.5 font-mono text-[10px] text-accent-foreground">
                          {badge}
                        </span>
                      )}
                      {!collapsed && badge === null && locked && <Lock className="ml-auto size-3 opacity-60" />}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t p-2.5">
          <div className={`flex items-center rounded-md bg-muted ${collapsed ? "justify-center p-1" : "gap-2.5 p-2"}`}>
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/40">
              {isAdmin ? <ShieldCheck className="size-4" /> : <Lock className="size-4" />}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13px] font-semibold">{isAdmin ? "Quản trị viên" : "Nhân viên bán hàng"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {isAdmin ? "Đã mở khoá quản trị" : "Quản trị đang khoá"}
                  </p>
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="size-7" title="Khoá quản trị" onClick={lock}>
                    <LogOut />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-5">
          <Button
            aria-label="Thu gọn thanh bên"
            title="Thu gọn thanh bên"
            variant="outline"
            size="icon"
            onClick={toggleCollapsed}
          >
            <Menu />
          </Button>
          <form
            onSubmit={submitSearch}
            className="hidden h-9 max-w-md flex-1 items-center gap-2 rounded-md border bg-card px-3 sm:flex"
          >
            <Search className="size-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              placeholder="Tìm sản phẩm, mã hoặc barcode…"
            />
            <span className="whitespace-nowrap rounded border px-1 font-mono text-[9px] text-muted-foreground">Ctrl K</span>
          </form>
          <div className="ml-auto hidden items-center gap-2 font-mono text-[10px] md:flex">
            <span className="rounded-md border bg-card px-2.5 py-1.5">Hôm nay · {format(now, "HH:mm")}</span>
            <Link
              to={alerts.lowStock > 0 ? "/import" : "/debts"}
              title={`${alerts.lowStock} sản phẩm sắp hết · ${alerts.unpaid} đơn chưa thanh toán`}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-semibold ${
                alertCount > 0 ? "border-primary/25 bg-primary/10 text-primary" : "bg-card text-muted-foreground"
              }`}
            >
              <span className={`size-1.5 rounded-full ${alertCount > 0 ? "bg-primary" : "bg-success"}`} />
              {alertCount} cảnh báo
            </Link>
          </div>
          <Button asChild>
            <Link to="/pos">
              <ShoppingCart />
              Bán hàng
            </Link>
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden p-4 sm:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
