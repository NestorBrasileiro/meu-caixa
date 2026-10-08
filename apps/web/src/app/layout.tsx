import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { SiteHeader } from "@/components/shell/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getConnections, getCurrentUser, getNow, getSyncRuns } from "@/lib/data"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "Meu Caixa", template: "%s · Meu Caixa" },
  description: "Painel financeiro pessoal: todos os bancos num só lugar.",
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [user, runs, connections] = await Promise.all([getCurrentUser(), getSyncRuns(), getConnections()])
  const lastRun = runs.find((run) => run.status !== "RUNNING")

  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={200}>
            <SidebarProvider>
              <AppSidebar user={user} />
              <SidebarInset>
                <SiteHeader
                  sync={{
                    lastSyncAt: lastRun?.finishedAt ?? null,
                    now: getNow(),
                    attentionCount: connections.filter((c) => c.status !== "ACTIVE").length,
                    running: runs.some((run) => run.status === "RUNNING"),
                  }}
                />
                <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 lg:py-8">{children}</div>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
