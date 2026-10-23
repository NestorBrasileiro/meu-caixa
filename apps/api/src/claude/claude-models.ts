/**
 * Modelos que a tela de Configurações oferece. Só os que aceitam o pedido
 * que o app monta (`prompts.ts`): thinking adaptativo, `effort` e
 * `fallbacks: "default"` (o Haiku 5.5 não tem fallback no servidor).
 */
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (padrão) · US$ 4 / 20 por 1M tokens' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 · US$ 2 / 10 por 1M tokens' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 · US$ 10 / 50 por 1M tokens' },
  { id: 'claude-opus-5', label: 'Claude Opus 5 · US$ 5 / 25 por 1M tokens' },
] as const;

export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]['id'];

export const CLAUDE_MODEL_IDS: readonly string[] = CLAUDE_MODELS.map((model) => model.id);

export const DEFAULT_CLAUDE_MODEL: ClaudeModelId = 'claude-opus-5-5';
