import { z } from 'zod';
import type { AnalysisSource } from '../database/schema.js';
import { analysisReportInputSchema, isoDateSchema } from './analysis.schema.js';
import type { AnalysisService } from './analysis.service.js';
import { type InsightsService, TRANSACTION_TYPES } from './insights.service.js';

/**
 * Ferramentas de análise financeira, independentes de protocolo: o servidor
 * MCP (`src/mcp`) registra estas mesmas definições, e a análise feita pela
 * interface pode embrulhá-las no Tool Runner da API da Anthropic (o formato
 * `name`/`description`/`inputSchema` zod/`run` é o do `betaZodTool`).
 */
export interface InsightTool<Schema extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  /** Só lê dados (não altera nada). */
  readOnly: boolean;
  run(input: z.output<Schema>): Promise<Record<string, unknown>>;
}

function defineTool<Schema extends z.ZodObject>(tool: InsightTool<Schema>): InsightTool {
  return tool as unknown as InsightTool;
}

const periodFields = {
  de: isoDateSchema.optional().describe('Primeiro dia do período (YYYY-MM-DD)'),
  ate: isoDateSchema.optional().describe('Último dia do período (YYYY-MM-DD)'),
};

export interface InsightToolsDeps {
  insights: InsightsService;
  analysis: AnalysisService;
  /** Quem está salvando as análises (`MCP` ou `APP`). */
  source: AnalysisSource;
}

export function createInsightTools({
  insights,
  analysis,
  source,
}: InsightToolsDeps): InsightTool[] {
  return [
    defineTool({
      name: 'resumo_financeiro',
      title: 'Resumo financeiro',
      description:
        'Visão geral da situação financeira agora: saldo somado das contas, dívida e limite dos cartões, ' +
        'receitas, gastos e resultado do mês atual (parcial) e do mês anterior, estado das conexões com os ' +
        'bancos e a última sincronização. Chame primeiro, no início de qualquer análise ou pergunta geral ' +
        '("como estou?", "sobrou dinheiro este mês?").',
      inputSchema: z.object({}),
      readOnly: true,
      run: () => insights.summary(),
    }),
    defineTool({
      name: 'listar_contas',
      title: 'Listar contas e cartões',
      description:
        'Lista as contas correntes, poupanças e cartões de crédito de todos os bancos, com saldo, limite, ' +
        'limite disponível e até quando as transações foram sincronizadas. Use para saber os ids das contas ' +
        '(filtro conta_id de buscar_transacoes) ou quando perguntarem sobre uma conta ou cartão específico.',
      inputSchema: z.object({}),
      readOnly: true,
      run: () => insights.listAccounts(),
    }),
    defineTool({
      name: 'buscar_transacoes',
      title: 'Buscar transações',
      description:
        'Busca transações individuais com filtros (período, conta, categoria, texto, tipo), da mais recente ' +
        'para a mais antiga ou pelos maiores valores. Use para examinar a fundo o que está por trás de um ' +
        'total (ex.: as compras de delivery do mês, uma cobrança suspeita, os maiores gastos do trimestre) e ' +
        'para citar evidências. Devolve no máximo `limite` itens, mas `encontradas`, `soma_gastos` e ' +
        '`soma_receitas` consideram todas as que casaram com os filtros. Período padrão: últimos 30 dias.',
      inputSchema: z.object({
        ...periodFields,
        conta_id: z.uuid().optional().describe('Id da conta (veja listar_contas)'),
        categoria: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .optional()
          .describe(
            'Categoria exata, como aparece no campo "categoria" das respostas (ex.: "Food delivery")',
          ),
        texto: z
          .string()
          .trim()
          .min(2)
          .max(100)
          .optional()
          .describe('Trecho da descrição ou do nome da contraparte (sem diferenciar maiúsculas)'),
        tipo: z
          .enum(TRANSACTION_TYPES)
          .default('todas')
          .describe(
            'gastos = saídas que contam como gasto; receitas = entradas de dinheiro novo; ' +
              'pagamentos_fatura e transferencias_proprias não são gasto nem renda',
          ),
        ordenar: z
          .enum(['recentes', 'maior_valor'])
          .default('recentes')
          .describe('recentes = por data; maior_valor = maiores valores absolutos primeiro'),
        limite: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe('Máximo de transações (1–200)'),
      }),
      readOnly: true,
      run: (input) => insights.searchTransactions(input),
    }),
    defineTool({
      name: 'gastos_por_categoria',
      title: 'Gastos por categoria',
      description:
        'Gasto total por categoria no período, com número de transações, participação no total, média ' +
        'mensal, o valor de cada mês e a variação do último mês contra o anterior. Use para descobrir para ' +
        'onde vai o dinheiro e o que mais pesa. Já desconta pagamento de fatura e transferência entre contas ' +
        'próprias (cada compra conta uma vez, na data da compra). Período padrão: os últimos 3 meses fechados.',
      inputSchema: z.object(periodFields),
      readOnly: true,
      run: (input) => insights.spendingByCategory(input),
    }),
    defineTool({
      name: 'fluxo_de_caixa',
      title: 'Fluxo de caixa mensal',
      description:
        'Receitas, gastos, resultado e taxa de poupança mês a mês, mais a média dos meses fechados. Use para ' +
        'ver a tendência (está sobrando ou faltando dinheiro? os gastos estão subindo?) e para estimar quanto ' +
        'dá para guardar por mês. O mês atual vem marcado como parcial.',
      inputSchema: z.object({
        meses: z.number().int().min(1).max(24).default(6).describe('Quantos meses (1–24)'),
        incluir_mes_atual: z
          .boolean()
          .default(true)
          .describe('Inclui o mês corrente (incompleto) como o último da lista'),
      }),
      readOnly: true,
      run: (input) => insights.cashFlow(input),
    }),
    defineTool({
      name: 'recorrencias',
      title: 'Gastos recorrentes',
      description:
        'Detecta gastos que se repetem: assinaturas e contas fixas (uma cobrança por mês, valor estável), ' +
        'hábitos frequentes (várias vezes por mês, como delivery e corridas de app), parcelamentos em ' +
        'andamento e gastos mensais de valor variável. Traz valor típico, meses com cobrança, se ainda está ' +
        'ativa, custo mensal e anual estimados. Essencial para achar assinaturas esquecidas, cobranças ' +
        'duplicadas e "gastos do pecado" (supérfluos recorrentes).',
      inputSchema: z.object({
        meses: z
          .number()
          .int()
          .min(2)
          .max(24)
          .default(6)
          .describe('Janela analisada em meses, contando o atual (2–24)'),
        minimo_meses: z
          .number()
          .int()
          .min(2)
          .max(12)
          .default(3)
          .describe('Mínimo de meses distintos com cobrança para considerar recorrente'),
      }),
      readOnly: true,
      run: (input) => insights.recurrences(input),
    }),
    defineTool({
      name: 'planejamento',
      title: 'Planejamento',
      description:
        'O planejamento cadastrado pelo usuário: compromissos fixos (ex.: parcela do terreno, com parcelas ' +
        'pagas), metas de economia (progresso, aporte necessário, se está no ritmo), categorias de orçamento ' +
        'com teto mensal comparado ao gasto real, gasto médio essencial vs. discricionário e a projeção dos ' +
        'próximos 6 meses. Use para separar gasto fixo de discricionário e para sugestões de planejamento.',
      inputSchema: z.object({}),
      readOnly: true,
      run: () => insights.planningOverview(),
    }),
    defineTool({
      name: 'salvar_analise',
      title: 'Salvar análise',
      description:
        'Salva o relatório final da análise para aparecer na tela "Análise" do Meu Caixa. Chame uma vez, ' +
        'no fim da análise, com os números tirados das outras ferramentas. Valores em centavos e positivos ' +
        '(R$ 55,90 = 5590). Se a validação falhar, corrija os campos indicados e chame de novo.',
      inputSchema: analysisReportInputSchema,
      readOnly: false,
      run: async (input) => {
        const saved = await analysis.save(input, source);
        return {
          salvo: true,
          id: saved.id,
          gerado_em: saved.generatedAt,
          insights: saved.insights.length,
        };
      },
    }),
    defineTool({
      name: 'ultima_analise',
      title: 'Última análise',
      description:
        'Devolve a última análise salva (de qualquer origem), ou null se ainda não houver. Use para ' +
        'comparar com uma análise nova ("o que mudou desde a última vez?") ou acompanhar sugestões anteriores.',
      inputSchema: z.object({}),
      readOnly: true,
      run: async () => ({ analise: await analysis.latest() }),
    }),
  ];
}
