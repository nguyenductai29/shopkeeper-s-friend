import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  PackagePlus,
  FileText,
  Users,
  Settings,
  Store,
  Lock,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAdmin } from "@/contexts/AdminContext";
import { Button } from "@/components/ui/button";

const mainItems = [
  { title: "Bảng điều khiển", url: "/", icon: LayoutDashboard },
  { title: "Bán hàng", url: "/pos", icon: ShoppingCart },
];

const adminItems = [
  { title: "Nhập hàng", url: "/import", icon: PackagePlus },
  { title: "Mẫu hoá đơn", url: "/invoice-templates", icon: FileText },
  { title: "Công nợ", url: "/debts", icon: Users },
  { title: "Cài đặt", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { isAdmin, lock } = useAdmin();

  const isActive = (path: string) => pathname === path;

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 w-full px-3 py-2 rounded-md transition-colors ${
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
    }`;

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md gradient-primary flex items-center justify-center shadow-glow shrink-0">
            <Store className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sm leading-tight">ShopFlow</span>
              <span className="text-xs text-muted-foreground">Quản lý bán hàng</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tổng quan</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={linkCls(isActive(item.url))}>
                      <item.icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1">
            Quản trị {!isAdmin && <Lock className="w-3 h-3" />}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className={linkCls(isActive(item.url))}>
                      <item.icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && !collapsed && (
          <div className="px-3 mt-auto pb-3">
            <Button variant="outline" size="sm" className="w-full" onClick={lock}>
              <LogOut className="w-3.5 h-3.5 mr-2" /> Khoá quản trị
            </Button>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
