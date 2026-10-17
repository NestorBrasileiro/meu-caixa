import { ASK_LIMITS, type AskTurn } from "@/lib/api/analysis"

/**
 * "Pergunte ao Claude": a conversa no browser, o histórico que vai para a API e as mensagens de erro.
 * Módulo puro; quem chama a API é `ask-claude-card.tsx`.
 */

/** Uma pergunta e, quando chegou, a resposta. Só trocas respondidas entram na conversa. */
export interface Exchange {
  id: string
  question: string
  /** Markdown. */
  answer: string
  model: string
}

/** Marcador do texto cortado no histórico (a resposta inteira continua na tela). */
const CUT = "…"

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - CUT.length).trimEnd()}${CUT}`
}

/**
 * Histórico enviado com a próxima pergunta: as últimas trocas (pergunta + resposta, alternando e
 * começando sempre pelo usuário), até `ASK_LIMITS.historyTurns` mensagens, cada uma cortada em
 * `ASK_LIMITS.turnContent` caracteres.
 */
export function askHistory(
  exchanges: readonly Exchange[],
  limits: { historyTurns: number; turnContent: number } = ASK_LIMITS,
): AskTurn[] {
  const pairs = Math.floor(limits.historyTurns / 2)
  if (pairs <= 0) return []
  return exchanges.slice(-pairs).flatMap((exchange) => [
    { role: "user" as const, content: clip(exchange.question, limits.turnContent) },
    { role: "assistant" as const, content: clip(exchange.answer, limits.turnContent) },
  ])
}

export type QuestionCheck = { ok: true; question: string } | { ok: false; message: string | null }

/** Pergunta pronta para enviar: sem espaços nas pontas, entre 1 e `ASK_LIMITS.question` caracteres. */
export function checkQuestion(text: string, max: number = ASK_LIMITS.question): QuestionCheck {
  const question = text.trim()
  // Vazia não é erro a anunciar: o botão só não faz nada.
  if (!question) return { ok: false, message: null }
  if (question.length > max) {
    return { ok: false, message: `A pergunta passou do limite de ${max} caracteres. Encurte um pouco.` }
  }
  return { ok: true, question }
}

/** Quando começar a mostrar o contador de caracteres. */
export function showCounter(length: number, max: number = ASK_LIMITS.question): boolean {
  return length >= max * 0.8
}

/**
 * Mensagem para quando a pergunta falha. A API responde em pt-BR nos erros de negócio (429: outra
 * pergunta ainda está sendo respondida; 503: sem ANTHROPIC_API_KEY); para o resto, uma frase nossa.
 */
export function askErrorMessage(error: unknown): string {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined
  if (typeof status !== "number") return "Sem conexão com a API. Verifique se ela está no ar e tente de novo."
  const raw = error && typeof error === "object" && "message" in error ? error.message : ""
  const message = typeof raw === "string" && !/^Erro \d+$/.test(raw.trim()) ? raw.trim() : ""
  if (status === 429) {
    return message || "O Claude ainda está respondendo outra pergunta. Espere um pouco e tente de novo."
  }
  if (status === 503) return message || "As perguntas estão indisponíveis: falta configurar a ANTHROPIC_API_KEY na API."
  // 502/504: a API explica em pt-BR o que deu errado com a Anthropic; 500 é erro genérico do servidor.
  if (status >= 500) return (status !== 500 && message) || "O Claude não conseguiu responder agora. Tente de novo em instantes."
  return message || `A API recusou a pergunta (erro ${status}).`
}

/** Links das respostas: só http(s). O resto (javascript:, data:, relativos) vira texto sem link. */
export function safeUrl(url: string): string | null {
  const value = url.trim()
  return /^https?:\/\/[^\s]+$/i.test(value) ? value : null
}
