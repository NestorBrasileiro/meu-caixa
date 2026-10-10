import Anthropic from '@anthropic-ai/sdk';

/**
 * Cliente da Anthropic de verdade (SDK, Tool Runner, streaming) com um
 * `fetch` falso que responde um roteiro: cada requisição a `/v1/messages`
 * consome o próximo passo. Grava o que o SDK mandou (headers e corpo) para os
 * testes conferirem o formato do pedido.
 */

export type ScriptedBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: Record<string, unknown> };

export type ScriptedReply =
  | {
      kind: 'message';
      content: ScriptedBlock[];
      stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';
      model?: string;
    }
  | { kind: 'error'; status: number; type: string; message: string };

export interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
}

export type Step = (request: RecordedRequest) => ScriptedReply | Promise<ScriptedReply>;

export const toolUse = (name: string, input: Record<string, unknown> = {}): ScriptedReply => ({
  kind: 'message',
  content: [{ type: 'tool_use', name, input }],
  stopReason: 'tool_use',
});

export const endTurn = (text: string): ScriptedReply => ({
  kind: 'message',
  content: [{ type: 'text', text }],
  stopReason: 'end_turn',
});

export const refusal = (): ScriptedReply => ({
  kind: 'message',
  content: [],
  stopReason: 'refusal',
});

export const apiError = (status: number, type: string, message = 'erro'): ScriptedReply => ({
  kind: 'error',
  status,
  type,
  message,
});

export class FakeClaude {
  readonly requests: RecordedRequest[] = [];
  private steps: Step[] = [];
  private nextId = 1;
  readonly client: Anthropic;

  constructor(readonly apiKey = 'sk-ant-chave-falsa-dos-testes') {
    this.client = new Anthropic({
      apiKey,
      authToken: null,
      baseURL: 'http://anthropic.test',
      maxRetries: 0,
      fetch: (url, init) => this.handle(String(url), init),
    });
  }

  /** Define o roteiro das próximas requisições (substitui o anterior). */
  script(...steps: Array<Step | ScriptedReply>): void {
    this.steps = steps.map((step) => (typeof step === 'function' ? step : () => step));
    this.requests.length = 0;
  }

  get pending(): number {
    return this.steps.length;
  }

  private async handle(url: string, init?: RequestInit): Promise<Response> {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>;
    const request = { url, headers, body };
    this.requests.push(request);
    const step = this.steps.shift();
    if (!step) throw new Error(`FakeClaude: requisição sem roteiro (${url})`);

    const reply = await abortable(Promise.resolve(step(request)), init?.signal);
    if (reply.kind === 'error') {
      return Response.json(
        { type: 'error', error: { type: reply.type, message: reply.message } },
        { status: reply.status, headers: { 'request-id': `req_${this.nextId++}` } },
      );
    }
    const message = this.buildMessage(reply, body.model as string);
    if (body.stream) {
      return new Response(toSse(message), {
        headers: { 'content-type': 'text/event-stream', 'request-id': `req_${this.nextId++}` },
      });
    }
    return Response.json(message);
  }

  private buildMessage(reply: Extract<ScriptedReply, { kind: 'message' }>, model: string) {
    return {
      id: `msg_${this.nextId++}`,
      type: 'message',
      role: 'assistant',
      model: reply.model ?? model,
      content: reply.content.map((block) =>
        block.type === 'text'
          ? { type: 'text', text: block.text, citations: null }
          : {
              type: 'tool_use',
              id: `toolu_${this.nextId++}`,
              name: block.name,
              input: block.input,
            },
      ),
      stop_reason: reply.stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 50,
      },
    };
  }
}

type FakeMessage = ReturnType<FakeClaude['buildMessage']>;

/** Eventos SSE da API de Messages para uma resposta completa. */
export function toSse(message: FakeMessage): string {
  const events: Array<[string, unknown]> = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          ...message,
          content: [],
          stop_reason: null,
          usage: { ...message.usage, output_tokens: 1 },
        },
      },
    ],
  ];
  message.content.forEach((block, index) => {
    if (block.type === 'text') {
      events.push(
        [
          'content_block_start',
          { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
        ],
        [
          'content_block_delta',
          { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } },
        ],
      );
    } else {
      events.push(
        [
          'content_block_start',
          { type: 'content_block_start', index, content_block: { ...block, input: {} } },
        ],
        [
          'content_block_delta',
          {
            type: 'content_block_delta',
            index,
            delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
          },
        ],
      );
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }]);
  });
  events.push(
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: message.stop_reason, stop_sequence: null },
        usage: { output_tokens: message.usage.output_tokens },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  );
  return events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('This operation was aborted', 'AbortError'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Promessa controlada pelo teste, para segurar uma resposta "em andamento". */
export function gate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}
