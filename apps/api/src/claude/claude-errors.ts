import Anthropic from '@anthropic-ai/sdk';
import { HttpStatus } from '@nestjs/common';

/**
 * Falha da análise pelo app, com mensagem em português segura para mostrar
 * na interface: nunca leva a API key, o corpo da resposta da Anthropic nem
 * stack trace (esses detalhes vão só para o log, sem a chave).
 */
export class ClaudeFailure extends Error {
  constructor(
    readonly code: ClaudeFailureCode,
    message: string,
    /** Status HTTP para as rotas síncronas (`POST /api/analysis/ask`). */
    readonly httpStatus: number = HttpStatus.BAD_GATEWAY,
  ) {
    super(message);
    this.name = 'ClaudeFailure';
  }
}

export type ClaudeFailureCode =
  | 'AUTH'
  | 'BILLING'
  | 'RATE_LIMIT'
  | 'OVERLOADED'
  | 'MODEL_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'SERVER_ERROR'
  | 'CONNECTION'
  | 'TIMEOUT'
  | 'REFUSAL'
  | 'MAX_TOKENS'
  | 'ITERATION_LIMIT'
  | 'NOT_SAVED'
  | 'EMPTY_ANSWER'
  | 'UNKNOWN';

export const FAILURE_MESSAGES: Record<ClaudeFailureCode, string> = {
  AUTH: 'A API da Anthropic recusou a chave configurada (ANTHROPIC_API_KEY inválida, revogada ou sem permissão). Confira a chave na configuração da API.',
  BILLING:
    'A conta da Anthropic está sem créditos ou com problema de pagamento. Confira o faturamento no console da Anthropic.',
  RATE_LIMIT: 'Limite de uso da API da Anthropic atingido. Espere alguns minutos e tente de novo.',
  OVERLOADED: 'A API da Anthropic está sobrecarregada no momento. Tente de novo em alguns minutos.',
  MODEL_NOT_FOUND:
    'O modelo configurado (ANTHROPIC_MODEL) não existe ou não está disponível para esta conta da Anthropic.',
  BAD_REQUEST:
    'A API da Anthropic recusou a requisição como inválida. Detalhes no log da API do Meu Caixa.',
  SERVER_ERROR: 'A API da Anthropic teve um erro interno. Tente de novo mais tarde.',
  CONNECTION: 'Não foi possível conectar à API da Anthropic. Verifique a rede do servidor.',
  TIMEOUT: 'O Claude demorou demais para responder e a execução foi interrompida.',
  REFUSAL:
    'O Claude recusou o pedido por política de segurança, mesmo depois de tentar um modelo alternativo.',
  MAX_TOKENS: 'A resposta do Claude passou do tamanho máximo e foi cortada.',
  ITERATION_LIMIT:
    'O Claude atingiu o limite de passos (chamadas de ferramentas) sem concluir. Tente de novo.',
  NOT_SAVED:
    'O Claude terminou sem salvar o relatório (salvar_analise não foi chamada com sucesso). Tente gerar de novo.',
  EMPTY_ANSWER: 'O Claude não devolveu uma resposta em texto. Tente reformular a pergunta.',
  UNKNOWN: 'Erro inesperado ao falar com o Claude. Detalhes no log da API do Meu Caixa.',
};

export function failure(code: ClaudeFailureCode, detail?: string): ClaudeFailure {
  const message = detail ? `${FAILURE_MESSAGES[code]} ${detail}` : FAILURE_MESSAGES[code];
  return new ClaudeFailure(code, message, httpStatusFor(code));
}

function httpStatusFor(code: ClaudeFailureCode): number {
  if (code === 'TIMEOUT') return HttpStatus.GATEWAY_TIMEOUT;
  return HttpStatus.BAD_GATEWAY;
}

/**
 * Traduz um erro do SDK (ou do loop) para `ClaudeFailure`. Classifica pelo
 * tipo do erro da API (`error.type`) e pela classe do SDK, nunca pelo texto.
 * `timedOut` indica que fomos nós que abortamos por estourar o tempo total.
 */
export function toClaudeFailure(error: unknown, timedOut = false): ClaudeFailure {
  if (error instanceof ClaudeFailure) return error;
  if (timedOut) return failure('TIMEOUT');
  if (error instanceof Anthropic.APIConnectionTimeoutError) return failure('TIMEOUT');
  if (error instanceof Anthropic.APIUserAbortError) return failure('TIMEOUT');
  if (error instanceof Anthropic.APIConnectionError) return failure('CONNECTION');
  if (error instanceof Anthropic.APIError) {
    switch (apiErrorType(error)) {
      case 'authentication_error':
      case 'permission_error':
        return failure('AUTH');
      case 'billing_error':
        return failure('BILLING');
      case 'rate_limit_error':
        return failure('RATE_LIMIT');
      case 'overloaded_error':
        return failure('OVERLOADED');
      case 'not_found_error':
        return failure('MODEL_NOT_FOUND');
      case 'invalid_request_error':
      case 'request_too_large':
        return failure('BAD_REQUEST');
      case 'api_error':
      case 'timeout_error':
        return failure('SERVER_ERROR');
    }
    const status = error.status ?? 0;
    if (status === 401 || status === 403) return failure('AUTH');
    if (status === 402) return failure('BILLING');
    if (status === 429) return failure('RATE_LIMIT');
    if (status === 529) return failure('OVERLOADED');
    if (status === 404) return failure('MODEL_NOT_FOUND');
    if (status >= 500) return failure('SERVER_ERROR');
    if (status >= 400) return failure('BAD_REQUEST');
  }
  return failure('UNKNOWN');
}

/**
 * Tipo do erro da API: `error.type` do SDK ou, num erro que chegou no meio do
 * stream (evento SSE `error`, sem status HTTP), o `error.type` do corpo.
 */
function apiErrorType(error: InstanceType<typeof Anthropic.APIError>): string | null {
  if (error.type) return error.type;
  const body = error.error as { error?: { type?: unknown }; type?: unknown } | undefined;
  const nested = body?.error?.type;
  return typeof nested === 'string' ? nested : null;
}

/** Linha de log sem segredos: classe, status, tipo, request id e a mensagem com chaves mascaradas. */
export function describeForLog(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return redactKeys(
      [
        error.constructor.name,
        error.status ?? 'sem status',
        apiErrorType(error) ?? 'sem tipo',
        error.requestID ? `request-id ${error.requestID}` : null,
        error.message,
      ]
        .filter(Boolean)
        .join(' | '),
    );
  }
  return redactKeys(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}

/** Mascara qualquer coisa com cara de chave da Anthropic (`sk-ant-...`). */
export function redactKeys(text: string): string {
  return text.replace(/sk-ant-[\w-]+/g, 'sk-ant-***');
}
