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
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card/50 backdrop-blur sticky top-0 z-10 px-4 gap-3">
            <SidebarTrigger />
            <div className="text-sm text-muted-foreground">{shopName}</div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
