import { describe, expect, it } from 'vitest';
import { logLevelsFor } from './log-levels.js';

describe('logLevelsFor', () => {
  it('padrão (sem LOG_LEVEL) até log, sem debug nem verbose', () => {
    expect(logLevelsFor(undefined)).toEqual(['fatal', 'error', 'warn', 'log']);
    expect(logLevelsFor('')).toEqual(['fatal', 'error', 'warn', 'log']);
  });

  it('cada nível inclui os menos detalhados', () => {
    expect(logLevelsFor('error')).toEqual(['fatal', 'error']);
    expect(logLevelsFor('debug')).toEqual(['fatal', 'error', 'warn', 'log', 'debug']);
    expect(logLevelsFor('verbose')).toEqual(['fatal', 'error', 'warn', 'log', 'debug', 'verbose']);
  });

  it('valor inválido cai no padrão (a validação do env acusa o erro depois)', () => {
    expect(logLevelsFor('tudo')).toEqual(['fatal', 'error', 'warn', 'log']);
  });
});
