"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { isActive, NAV_ITEMS } from "./nav"
import type * as React from "react"
import { ThemeToggle } from "./theme-toggle"

/** `syncStatus` chega pronto do servidor (dentro de um Suspense, porque lê a sessão). */
export function SiteHeader({ syncStatus }: { syncStatus: React.ReactNode }) {
  const pathname = usePathname()
  const current = NAV_ITEMS.find((item) => isActive(pathname, item.href))

  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <span className="truncate text-sm font-medium">{current?.title ?? "Meu Caixa"}</span>
      <div className="ml-auto flex items-center gap-1">
        <Link href="/contas" className="rounded-md">
          {syncStatus}
        </Link>
        <ThemeToggle />
      </div>
    </header>
  )
}
