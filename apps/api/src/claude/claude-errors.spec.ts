import Anthropic from '@anthropic-ai/sdk';
import {
  ClaudeFailure,
  describeForLog,
  FAILURE_MESSAGES,
  failure,
  toClaudeFailure,
} from './claude-errors.js';

const KEY = 'sk-ant-api03-segredo';

function statusError(status: number, type: string): Error {
  return Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type, message: `falhou com ${KEY}` } },
    undefined,
    new Headers({ 'request-id': 'req_123' }),
  );
}

describe('toClaudeFailure', () => {
  it.each([
    [401, 'authentication_error', 'AUTH', 502],
    [403, 'permission_error', 'AUTH', 502],
    [402, 'billing_error', 'BILLING', 502],
    [429, 'rate_limit_error', 'RATE_LIMIT', 502],
    [529, 'overloaded_error', 'OVERLOADED', 502],
    [404, 'not_found_error', 'MODEL_NOT_FOUND', 502],
    [400, 'invalid_request_error', 'BAD_REQUEST', 502],
    [500, 'api_error', 'SERVER_ERROR', 502],
  ])('HTTP %i (%s) → %s', (status, type, code, httpStatus) => {
    const result = toClaudeFailure(statusError(status, type));
    expect(result).toBeInstanceOf(ClaudeFailure);
    expect(result.code).toBe(code);
    expect(result.httpStatus).toBe(httpStatus);
    expect(result.message).toBe(FAILURE_MESSAGES[result.code]);
    expect(result.message).not.toContain(KEY);
  });

  it('classifica pelo status quando o corpo não traz o tipo', () => {
    expect(toClaudeFailure(Anthropic.APIError.generate(529, {}, 'x', new Headers())).code).toBe(
      'OVERLOADED',
    );
    expect(toClaudeFailure(Anthropic.APIError.generate(503, {}, 'x', new Headers())).code).toBe(
      'SERVER_ERROR',
    );
  });

  it('erro no meio do stream (sem status) usa o tipo do corpo', () => {
    const error = new Anthropic.APIError(
      undefined,
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
      'Overloaded',
      undefined,
    );
    expect(toClaudeFailure(error).code).toBe('OVERLOADED');
  });

  it('tempo esgotado: abort nosso, timeout do SDK → TIMEOUT (504)', () => {
    const aborted = toClaudeFailure(new Anthropic.APIUserAbortError(), true);
    expect(aborted.code).toBe('TIMEOUT');
    expect(aborted.httpStatus).toBe(504);
    expect(toClaudeFailure(new Anthropic.APIConnectionTimeoutError()).code).toBe('TIMEOUT');
    expect(toClaudeFailure(new Error('qualquer coisa'), true).code).toBe('TIMEOUT');
  });

  it('falha de conexão e erros desconhecidos têm mensagem genérica', () => {
    expect(
      toClaudeFailure(new Anthropic.APIConnectionError({ message: 'ECONNREFUSED' })).code,
    ).toBe('CONNECTION');
    const unknown = toClaudeFailure(new TypeError(`stack com ${KEY}`));
    expect(unknown.code).toBe('UNKNOWN');
    expect(unknown.message).not.toContain(KEY);
  });

  it('mantém uma ClaudeFailure já classificada', () => {
    const refusal = failure('REFUSAL');
    expect(toClaudeFailure(refusal)).toBe(refusal);
  });
});

describe('describeForLog', () => {
  it('traz classe, status, tipo e request id', () => {
    const line = describeForLog(statusError(429, 'rate_limit_error'));
    expect(line).toContain('RateLimitError');
    expect(line).toContain('429');
    expect(line).toContain('rate_limit_error');
    expect(line).toContain('req_123');
    expect(line).not.toContain(KEY);
    expect(line).toContain('sk-ant-***');
  });
});
