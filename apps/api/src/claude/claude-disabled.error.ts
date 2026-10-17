/** `ANTHROPIC_API_KEY` não configurada: as rotas da análise pelo app respondem 503. */
export class ClaudeDisabledError extends Error {
  constructor() {
    super(
      'A análise pelo app está desligada: configure ANTHROPIC_API_KEY na API (cobrada por uso na Anthropic). ' +
        'A análise pelo seu Claude via MCP continua disponível.',
    );
    this.name = 'ClaudeDisabledError';
  }
}
