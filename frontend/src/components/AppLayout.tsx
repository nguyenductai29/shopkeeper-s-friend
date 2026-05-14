import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { settingsStore } from '@/lib/fileStore'
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'

export default function AppLayout() {
  const [shopName, setShopName] = useState('ShopFlow')

  useEffect(() => {
    settingsStore.get().then((s) => {
      if (s.shop_name) setShopName(s.shop_name)
    })
  }, [])

  return (
    <SidebarProvider className="h-full min-h-0 overflow-hidden">
      <div className="h-screen flex w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex-1 flex h-full min-w-0 flex-col overflow-hidden">
          <header className="h-14 shrink-0 flex items-center border-b bg-card/50 backdrop-blur px-4 gap-3">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground">{shopName}</div>
          </header>
          <main className="flex-1 min-h-0 overflow-hidden p-3 md:p-4">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
