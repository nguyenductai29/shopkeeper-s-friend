import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
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
  UserRound,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAdmin } from "@/contexts/AdminContext";
import { useShopName } from "@/hooks/useShopName";
import { ordersStore, productsStore } from "@/lib/fileStore";
import { cn } from "@/lib/utils";

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
      { label: "Thu chi", icon: WalletCards, to: "/finance" },
      { label: "Công nợ", icon: HandCoins, to: "/debts", admin: true },
      { label: "Mẫu hóa đơn", icon: FileText, to: "/invoice-templates", admin: true },
      { label: "VietQR", icon: QrCode, to: "/payment-qrs", admin: true },
      { label: "Cài đặt", icon: Settings, to: "/settings", admin: true },
    ],
  },
];

const allNavItems = navGroups.flatMap((group) => group.items);

const LOW_STOCK_LIMIT = 5;
const COLLAPSED_KEY = "shopflow:sidebar-collapsed";
const STATS_REFRESH_MS = 60_000;

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

function readCollapsed() {
  try {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved !== null) return saved === "1";
  } catch {
    // ignore unavailable storage
  }
  return window.innerWidth < 1100;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function useShopStats() {
  const [stats, setStats] = useState<{ lowStock: number; ordersToday: number } | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    let active = true;
    const load = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      try {
        const [products, orders] = await Promise.all([
          productsStore.list(),
          ordersStore.listSince(today.toISOString()),
        ]);
        if (!active) return;
        setStats({
          lowStock: products.filter((p) => Number(p.stock || 0) <= LOW_STOCK_LIMIT).length,
          ordersToday: orders.filter((o) => new Date(o.created_at) >= today).length,
        });
      } catch {
        // keep the last known numbers when the local API is unavailable
      }
    };
    load();
    const timer = window.setInterval(load, STATS_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pathname]);

  return stats;
}

function QuickSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const matches = query.trim()
    ? allNavItems.filter((item) => normalize(item.label).includes(normalize(query.trim())))
    : allNavItems;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (item: NavItem | undefined) => {
    if (!item) return;
    navigate(item.to);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((value) => Math.min(value + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(matches[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative hidden max-w-md flex-1 sm:block">
      <label className="flex h-9 items-center gap-2 rounded-md border bg-card px-3">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          placeholder="Tìm nhanh chức năng…"
        />
        <span className="rounded border px-1 font-mono text-[9px] text-muted-foreground">Ctrl K</span>
      </label>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {matches.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-muted-foreground">Không tìm thấy chức năng phù hợp</p>
          ) : (
            matches.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.to}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => go(item)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2.5 rounded px-2.5 text-left text-[13px]",
                    index === highlight ? "bg-muted" : "",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.label}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{item.to}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const shopName = useShopName();
  const { isAdmin, lock } = useAdmin();
  const now = useClock();
  const stats = useShopStats();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore unavailable storage
    }
  }, [collapsed]);

  const time = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r bg-card/90 backdrop-blur-md transition-[width] duration-300",
          collapsed ? "w-16" : "w-[248px]",
        )}
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
                <p className="flex items-center gap-1 px-2.5 pb-1.5 pt-1 font-mono text-[10px] uppercase text-muted-foreground">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const locked = item.admin && !isAdmin;
                  const badge = item.to === "/sales" && stats?.ordersToday ? stats.ordersToday : null;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      title={collapsed ? item.label : locked ? `${item.label} · cần mở khoá quản trị` : undefined}
                      className={({ isActive }) =>
                        cn(
                          "flex h-9 w-full items-center rounded-md transition-colors",
                          collapsed ? "justify-center" : "gap-2.5 px-2.5",
                          isActive ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className="size-4 shrink-0" />
                          {!collapsed && <span className="truncate font-medium">{item.label}</span>}
                          {!collapsed && (badge || locked) && (
                            <span className="ml-auto flex items-center gap-1.5">
                              {badge && (
                                <span
                                  title="Đơn hàng hôm nay"
                                  className="rounded bg-accent/35 px-1.5 font-mono text-[10px] text-accent-foreground"
                                >
                                  {badge}
                                </span>
                              )}
                              {locked && (
                                <Lock
                                  className={cn(
                                    "size-3 shrink-0",
                                    isActive ? "text-primary-foreground/70" : "text-muted-foreground",
                                  )}
                                />
                              )}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t p-2.5">
          {collapsed ? (
            isAdmin ? (
              <button
                type="button"
                onClick={lock}
                title="Khoá quản trị"
                className="mx-auto grid size-9 place-items-center rounded-md bg-muted text-foreground/70 hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            ) : (
              <Link
                to="/settings"
                title="Mở khoá quản trị"
                className="mx-auto grid size-9 place-items-center rounded-md bg-muted text-foreground/70 hover:text-foreground"
              >
                <Lock className="size-4" />
              </Link>
            )
          ) : (
            <div className="flex items-center gap-2.5 rounded-md bg-muted p-2">
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-accent/40">
                {isAdmin ? <ShieldCheck className="size-4" /> : <UserRound className="size-4" />}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-semibold">{isAdmin ? "Quản trị viên" : "Nhân viên bán hàng"}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {isAdmin ? "Đã mở khoá quản trị" : "Khu quản trị đang khoá"}
                </p>
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={lock}
                  title="Khoá quản trị"
                  className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background/70 hover:text-foreground"
                >
                  <LogOut className="size-3.5" />
                </button>
              ) : (
                <Link
                  to="/settings"
                  title="Mở khoá quản trị"
                  className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background/70 hover:text-foreground"
                >
                  <Lock className="size-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-5">
          <Button
            aria-label="Thu gọn thanh bên"
            title="Thu gọn thanh bên"
            variant="outline"
            size="icon"
            onClick={() => setCollapsed((value) => !value)}
          >
            <Menu />
          </Button>
          <QuickSearch />
          <div className="ml-auto hidden items-center gap-2 font-mono text-[10px] md:flex">
            <span className="rounded-md border bg-card px-2.5 py-1.5">Hôm nay · {time}</span>
            {stats &&
              (stats.lowStock > 0 ? (
                <Link
                  to="/import"
                  title={`${stats.lowStock} sản phẩm còn từ ${LOW_STOCK_LIMIT} trở xuống`}
                  className="flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1.5 font-semibold text-primary"
                >
                  <span className="size-1.5 rounded-full bg-primary" />
                  {stats.lowStock} sắp hết hàng
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 rounded-md border border-success/25 bg-success/10 px-2.5 py-1.5 font-semibold text-success">
                  <span className="size-1.5 rounded-full bg-success" />
                  Kho ổn định
                </span>
              ))}
          </div>
          <Button asChild className="max-md:ml-auto">
            <Link to="/pos">
              <ShoppingCart />
              Bán hàng
            </Link>
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
