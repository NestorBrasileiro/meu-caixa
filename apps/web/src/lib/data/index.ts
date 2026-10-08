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
export const getAnalysis = source.getAnalysis

/** O relatório da análise ainda é de exemplo (até o MCP, marco de 100%). */
export const ANALYSIS_IS_SAMPLE = true
