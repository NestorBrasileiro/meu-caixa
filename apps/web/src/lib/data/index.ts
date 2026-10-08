import type { AnalysisReport } from "@/lib/api/analysis"
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
import { buildAnalysis } from "@/lib/mock/analysis"
import { MOCK_NOW, MOCK_TODAY, mockDataset } from "@/lib/mock/generator"
import { buildPlanning } from "@/lib/mock/planning"

/**
 * Ponto único de acesso a dados das telas. Hoje devolve dados mocados no
 * formato exato da API; no marco de 75% estas funções passam a chamar a API
 * (com o cookie de sessão) e nenhuma tela precisa mudar.
 */

/** "Hoje" para as telas. Mocado: data fixa (não usar o relógio no servidor). */
export function getToday(): IsoDate {
  return MOCK_TODAY
}

/** Instante de referência para textos relativos ("há 3 h"). */
export function getNow(): IsoDateTime {
  return MOCK_NOW
}

export async function getCurrentUser(): Promise<AuthUser> {
  return {
    id: "user-1",
    username: "nestor",
    name: "Nestor Brasileiro",
    email: "nestor@example.com",
    roles: ["owner"],
  }
}

export async function getConnections(): Promise<Connection[]> {
  return mockDataset().connections
}

export async function getAccounts(): Promise<Account[]> {
  return mockDataset().accounts
}

/** Mesma semântica de GET /transactions: filtros, mais recentes primeiro, paginação. */
export async function getTransactions(query: TransactionQuery = {}): Promise<Page<Transaction>> {
  const search = query.search?.toLocaleLowerCase("pt-BR")
  const filtered = mockDataset().transactions.filter(
    (tx) =>
      (!query.accountId || tx.accountId === query.accountId) &&
      (!query.from || tx.date >= query.from) &&
      (!query.to || tx.date <= query.to) &&
      (!query.status || tx.status === query.status) &&
      (!search ||
        tx.description.toLocaleLowerCase("pt-BR").includes(search) ||
        (tx.counterpartyName ?? "").toLocaleLowerCase("pt-BR").includes(search)),
  )
  const limit = query.limit ?? 50
  const offset = query.offset ?? 0
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset }
}

/** Todas as transações do período (para agregações nas telas). */
export async function getAllTransactions(range?: { from?: IsoDate; to?: IsoDate }): Promise<Transaction[]> {
  const page = await getTransactions({ ...range, limit: Number.MAX_SAFE_INTEGER })
  return page.items
}

export async function getInvoices(query: { accountId?: string } = {}): Promise<Invoice[]> {
  return mockDataset().invoices.filter((i) => !query.accountId || i.accountId === query.accountId)
}

export async function getSyncRuns(): Promise<SyncRun[]> {
  return mockDataset().syncRuns
}

export async function getPlanning(): Promise<PlanningOverview> {
  return buildPlanning(mockDataset())
}

export async function getAnalysis(): Promise<AnalysisReport> {
  return buildAnalysis(mockDataset())
}
