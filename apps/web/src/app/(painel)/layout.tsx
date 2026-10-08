import { Suspense } from "react"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { SessionSyncStatus, SessionUserMenu, UserMenuSkeleton } from "@/components/shell/session-slots"
import { SiteHeader } from "@/components/shell/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

/** Moldura do painel: menu lateral, cabeçalho e os pedaços que dependem da sessão. */
export default function PainelLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar
        userMenu={
          <Suspense fallback={<UserMenuSkeleton />}>
            <SessionUserMenu />
          </Suspense>
        }
      />
      <SidebarInset>
        <SiteHeader
          syncStatus={
            <Suspense fallback={null}>
              <SessionSyncStatus />
            </Suspense>
          }
        />
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 lg:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
