import * as apiSource from "./api-source"
import * as mockSource from "./mock-source"

/**
 * Ponto único de acesso a dados das telas (só no servidor).
 *
 * - `DATA_SOURCE=api` (padrão): chama a API com o cookie de sessão.
 * - `DATA_SOURCE=mock`: dataset fictício, sem API, banco nem Keycloak.
 *
 * As duas fontes seguem os mesmos contratos (`src/lib/api`).
 */
const source = process.env.DATA_SOURCE === "mock" ? mockSource : apiSource

export const DATA_SOURCE: "api" | "mock" = process.env.DATA_SOURCE === "mock" ? "mock" : "api"

/**
 * Só a fonte real salva alterações. Com `mock`, as telas desabilitam as ações
 * de escrita e explicam o porquê (`READ_ONLY_HINT`, em `./mode`).
 */
export const CAN_WRITE = DATA_SOURCE === "api"

export const getToday = source.getToday
export const getNow = source.getNow
export const getCurrentUser = source.getCurrentUser
export const getConnections = source.getConnections
export const getAccounts = source.getAccounts
export const getTransactions = source.getTransactions
export const getAllTransactions = source.getAllTransactions
export const getInvoices = source.getInvoices
export const getSyncRuns = source.getSyncRuns
export const getPlanning = source.getPlanning
/** Última análise; no modo mock, o relatório de exemplo (`sample: true`). */
export const getAnalysis = source.getAnalysis
export const getAnalysisStatus = source.getAnalysisStatus
