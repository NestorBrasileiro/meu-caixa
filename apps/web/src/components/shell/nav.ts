import { ArrowLeftRight, Landmark, LayoutDashboard, Sparkles, Target, type LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Visão geral",
    href: "/",
    icon: LayoutDashboard,
    description: "Saldo, faturas, fluxo do mês e maiores vazamentos",
  },
  {
    title: "Contas",
    href: "/contas",
    icon: Landmark,
    description: "Bancos conectados, saldos, limites e sincronização",
  },
  {
    title: "Transações",
    href: "/transacoes",
    icon: ArrowLeftRight,
    description: "Lista unificada de todos os bancos",
  },
  {
    title: "Planejamento",
    href: "/planejamento",
    icon: Target,
    description: "Compromissos fixos, metas, categorias e projeções",
  },
  {
    title: "Análise do Claude",
    href: "/analise",
    icon: Sparkles,
    description: "O que cortar, gastos do pecado e sugestões",
  },
]

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}
