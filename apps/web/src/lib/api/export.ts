import type { IsoDate } from "./types"

/** Exportação: contratos de `GET /api/export/options` e `GET /api/export` (módulo `export` da API). */

export type ExportFormatId = "xlsx" | "pdf" | "csv" | "md"

export interface ExportFormat {
  id: ExportFormatId
  label: string
  /** Extensão do arquivo baixado (o CSV vem num .zip, um arquivo por seção). */
  extension: string
  description: string
}

export interface ExportSection {
  id: string
  label: string
  description: string
}

/** GET /api/export/options */
export interface ExportOptions {
  formats: ExportFormat[]
  /** Na ordem em que entram no arquivo. */
  sections: ExportSection[]
  /** Período sugerido (os últimos 3 meses). */
  defaultPeriod: { from: IsoDate; to: IsoDate }
  /** Maior período aceito, em meses. */
  maxMonths: number
}

/**
 * O catálogo do contrato, em pt-BR. Vale no modo mock (sem API) e como reserva se
 * `GET /api/export/options` falhar: a página continua montando o pedido.
 */
export const EXPORT_FORMATS: ExportFormat[] = [
  { id: "xlsx", label: "Excel", extension: "xlsx", description: "Planilha com uma aba por seção." },
  { id: "pdf", label: "PDF", extension: "pdf", description: "Relatório para ler ou imprimir." },
  { id: "csv", label: "CSV", extension: "zip", description: "Um arquivo por seção, para outras ferramentas." },
  { id: "md", label: "Markdown", extension: "md", description: "Para colar numa IA ou ler em qualquer editor." },
]

export const EXPORT_SECTIONS: ExportSection[] = [
  { id: "resumo", label: "Resumo", description: "Saldos, faturas e o período em números." },
  { id: "contas", label: "Contas", description: "Saldo e dados de cada conta." },
  { id: "cartoes", label: "Cartões", description: "Limite, uso e disponível de cada cartão." },
  { id: "faturas", label: "Faturas", description: "Histórico das faturas dos cartões." },
  { id: "parcelamentos", label: "Parcelamentos", description: "Compras parceladas ainda em aberto." },
  { id: "emprestimos", label: "Empréstimos", description: "Saldo devedor, parcelas e taxas." },
  { id: "compromissos", label: "Compromissos", description: "Contas fixas, assinaturas e financiamentos." },
  { id: "metas", label: "Metas", description: "Quanto já foi guardado em cada meta." },
  { id: "orcamento", label: "Orçamento", description: "Limite de cada categoria e quanto já foi usado." },
  { id: "projecao", label: "Projeção", description: "Quanto deve sobrar nos próximos meses." },
  { id: "fluxo", label: "Fluxo de caixa", description: "Entradas e saídas, mês a mês." },
  { id: "categorias", label: "Gastos por categoria", description: "Quanto foi para cada categoria no período." },
  { id: "recorrencias", label: "Recorrências", description: "Gastos que se repetem todo mês." },
  { id: "transacoes", label: "Transações", description: "Todas as transações do período." },
  { id: "analise", label: "Análise do Claude", description: "A última análise salva, se houver." },
]

/** Maior período aceito pela API (contrato). */
export const EXPORT_MAX_MONTHS = 24
