import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import type { AnalysisStatus, ShownAnalysis, StoredAnalysis } from "@/lib/api/analysis"
import type { PlanningOverview } from "@/lib/api/planning"
import type {
  Account,
  AuthUser,
  Connection,
  Invoice,
  IsoDate,
  IsoDateTime,
  Page,
  SyncRun,
  Transaction,
  TransactionQuery,
} from "@/lib/api/types"

/**
 * Fonte real: chama a API (servidor → servidor) repassando o cookie de sessão
 * do browser. Sem sessão a API responde 401 e o usuário vai para o login; sem
 * a role exigida, 403 e a página "sem acesso".
 */

const API_URL = process.env.API_URL ?? "http://localhost:3000"
const TIME_ZONE = process.env.TIMEZONE ?? "America/Sao_Paulo"
/** Máximo que GET /api/transactions aceita por página. */
const PAGE_LIMIT = 500

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`API respondeu ${status} em ${path}`)
    this.name = "ApiError"
  }
}

async function request(path: string): Promise<Response> {
  const cookieHeader = (await cookies()).toString()
  const response = await fetch(`${API_URL}${path}`, {
    headers: { accept: "application/json", ...(cookieHeader ? { cookie: cookieHeader } : {}) },
  })
  if (response.status === 401) redirect("/auth/login")
  if (response.status === 403) redirect("/sem-acesso")
  return response
}

async function api<T>(path: string): Promise<T> {
  const response = await request(path)
  if (!response.ok) throw new ApiError(response.status, path)
  return (await response.json()) as T
}

/** Como `api`, mas um 404 ("ainda não existe") vira `null` em vez de erro. */
async function apiOrNull<T>(path: string): Promise<T | null> {
  const response = await request(path)
  if (response.status === 404) return null
  if (!response.ok) throw new ApiError(response.status, path)
  return (await response.json()) as T
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ""
}

/** "Hoje" no fuso do usuário. O relógio só pode ser lido depois de `connection()`. */
export async function getToday(): Promise<IsoDate> {
  await connection()
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export async function getNow(): Promise<IsoDateTime> {
  await connection()
  return new Date().toISOString()
}

export function getCurrentUser(): Promise<AuthUser> {
  return api<AuthUser>("/auth/me")
}

export function getConnections(): Promise<Connection[]> {
  return api<Connection[]>("/api/connections")
}

export function getAccounts(): Promise<Account[]> {
  return api<Account[]>("/api/accounts")
}

export function getTransactions(params: TransactionQuery = {}): Promise<Page<Transaction>> {
  return api<Page<Transaction>>(`/api/transactions${query({ ...params })}`)
}

/**
 * Junta as páginas (paginação por offset) sem repetir itens. Se uma sincronização insere transações
 * no meio da leitura, as linhas escorregam para a página seguinte e voltariam repetidas (contadas duas
 * vezes nos totais): fica a primeira vez que cada id aparece, mantendo a ordem da API (mais novas primeiro).
 */
export async function collectPages<T extends { id: string }>(
  fetchPage: (offset: number) => Promise<Page<T>>,
  pageSize: number,
): Promise<T[]> {
  const byId = new Map<string, T>()
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset)
    for (const item of page.items) if (!byId.has(item.id)) byId.set(item.id, item)
    if (page.items.length < pageSize || offset + page.items.length >= page.total) return [...byId.values()]
  }
}

/** Todas as transações do período, página a página. */
export function getAllTransactions(range: { from?: IsoDate; to?: IsoDate } = {}): Promise<Transaction[]> {
  return collectPages((offset) => getTransactions({ ...range, limit: PAGE_LIMIT, offset }), PAGE_LIMIT)
}

export function getInvoices(params: { accountId?: string } = {}): Promise<Invoice[]> {
  return api<Invoice[]>(`/api/invoices${query(params)}`)
}

export function getSyncRuns(): Promise<SyncRun[]> {
  return api<SyncRun[]>("/api/sync/runs")
}

export function getPlanning(): Promise<PlanningOverview> {
  return api<PlanningOverview>("/api/planning")
}

/** Última análise do Claude (via MCP ou gerada pelo app); null enquanto não houver nenhuma. */
export async function getAnalysis(): Promise<ShownAnalysis | null> {
  const report = await apiOrNull<StoredAnalysis>("/api/analysis/latest")
  return report && { ...report, sample: false }
}

/** Se o app pode gerar análises e responder perguntas (ANTHROPIC_API_KEY) e a última geração. */
export function getAnalysisStatus(): Promise<AnalysisStatus> {
  return api<AnalysisStatus>("/api/analysis/status")
}
