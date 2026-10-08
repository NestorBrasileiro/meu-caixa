/** Telas de acesso (sem permissão, erro de login): sem menu nem chamadas à API. */
export default function AcessoLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-svh items-center justify-center px-4 py-12">{children}</main>
}
