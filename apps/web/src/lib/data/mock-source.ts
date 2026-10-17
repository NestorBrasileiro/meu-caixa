import type { AnalysisStatus, ShownAnalysis } from "@/lib/api/analysis"
import type { PlanningOverview } from "@/lib/api/planning"
import type { OpenFinanceItem, OpenFinanceSettings } from "@/lib/api/settings"
import type {
  Account,
  AuthUser,
  Connection,
  ConnectionStatus,
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
 * Fonte mocada (DATA_SOURCE=mock): mesmos contratos da API, com o dataset
 * determinístico de `src/lib/mock`. Serve para mexer na interface sem subir
 * API, banco e Keycloak.
 */

/** "Hoje" para as telas. Mocado: data fixa (não usar o relógio no servidor). */
export async function getToday(): Promise<IsoDate> {
  return MOCK_TODAY
}

/** Instante de referência para textos relativos ("há 3 h"). */
export async function getNow(): Promise<IsoDateTime> {
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

/** Relatório ilustrativo, montado com o dataset fictício: as telas o mostram como exemplo. */
export async function getAnalysis(): Promise<ShownAnalysis | null> {
  return { ...buildAnalysis(mockDataset()), id: "exemplo", source: "MCP", model: null, sample: true }
}

/** Sem API não há chave da Anthropic: gerar e perguntar ficam indisponíveis. */
export async function getAnalysisStatus(): Promise<AnalysisStatus> {
  return { app: { enabled: false, model: null }, latestRun: null }
}

/** Status da Pluggy equivalente ao estado de cada conexão do dataset. */
const ITEM_STATUS: Record<ConnectionStatus, string> = {
  ACTIVE: "UPDATED",
  UPDATING: "UPDATING",
  ACTION_REQUIRED: "LOGIN_ERROR",
  ERROR: "OUTDATED",
}

/**
 * Estado de exemplo da tela de configurações: Meu Pluggy escolhido no app, credenciais salvas e um
 * item por banco do dataset. As ações ficam desabilitadas (não há API para salvar).
 */
export async function getOpenFinanceSettings(): Promise<OpenFinanceSettings> {
  const list: OpenFinanceItem[] = mockDataset().connections.map((connection, index) => ({
    id: `0b7c2f4e-5a1d-4c3b-9e8f-00000000000${index + 1}`,
    institutionName: connection.institutionName,
    status: ITEM_STATUS[connection.status],
    lastUpdatedAt: connection.lastRefreshedAt,
    error:
      connection.status === "ACTION_REQUIRED"
        ? "A senha do banco mudou. Entre de novo no Meu Pluggy para reconectar."
        : null,
  }))
  return {
    mode: { value: "pluggy", source: "app" },
    credentials: { configured: true, source: "app", clientIdHint: "1a2b3c4d…", updatedAt: "2026-09-02T14:20:00.000Z" },
    items: { source: "app", list },
    connectUrl: "https://meu.pluggy.ai",
  }
}
