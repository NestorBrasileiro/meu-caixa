/** Sem chave da Anthropic utilizável: as rotas da análise pelo app respondem 503. */
export class ClaudeDisabledError extends Error {
  constructor(
    message = 'A análise pelo app está desligada: cadastre a chave da Anthropic em Configurações (cobrada por uso na Anthropic). ' +
      'A análise pelo seu Claude via MCP continua disponível.',
  ) {
    super(message);
    this.name = 'ClaudeDisabledError';
  }
}
