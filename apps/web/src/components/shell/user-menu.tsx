"use client"

import { ChevronsUpDown, LogOut } from "lucide-react"
import type { AuthUser } from "@/lib/api/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

export function UserMenu({ user }: { user: AuthUser }) {
  const { isMobile } = useSidebar()
  const name = user.name ?? user.username ?? "Usuário"
  // Segunda linha: o e-mail; sem ele, o login (se for diferente do nome já mostrado).
  const detail = user.email ?? (user.username && user.username !== name ? user.username : null)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Recolhido (só ícones), o botão vira o avatar: a dica mostra de quem é a sessão. */}
            <SidebarMenuButton size="lg" tooltip={name} className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="text-foreground rounded-lg text-xs font-medium">{initials(name)}</AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                {detail && <span className="text-muted-foreground truncate text-xs">{detail}</span>}
              </div>
              <ChevronsUpDown className="text-muted-foreground ml-auto size-4" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="grid text-sm leading-tight">
                <span className="font-medium">{name}</span>
                {detail && <span className="text-muted-foreground text-xs">{detail}</span>}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* Logout é da API (encerra a sessão e o SSO no Keycloak). */}
            <DropdownMenuItem asChild>
              <a href="/auth/logout">
                <LogOut aria-hidden />
                Sair
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
