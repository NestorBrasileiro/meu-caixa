import type { LogLevel } from '@nestjs/common';

/** Do menos ao mais detalhado: cada nível inclui os anteriores. */
export const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
export type LogLevelName = (typeof LOG_LEVELS)[number];

/**
 * Níveis que o logger do Nest mostra para `LOG_LEVEL`. Lido antes da validação
 * do env (o logger nasce antes dos módulos); valor inválido cai no padrão e a
 * validação do env acusa o erro em seguida.
 */
export function logLevelsFor(value: string | undefined): LogLevel[] {
  const index = LOG_LEVELS.indexOf((value || 'log') as LogLevelName);
  return ['fatal', ...LOG_LEVELS.slice(0, (index === -1 ? 2 : index) + 1)];
}
