import { z } from 'zod';
import { isIsoDate } from '../domain/dates.js';
import type { IsoDate } from '../domain/finance.js';
import { monthOf, monthRange, shiftMonth } from '../domain/months.js';
import { monthsInRange } from '../insights/aggregate.js';
import {
  EXPORT_FORMATS,
  type ExportFormat,
  MAX_EXPORT_MONTHS,
  SECTION_IDS,
  type SectionId,
} from './export.catalog.js';

/** Pedido inválido: a mensagem (em português) vai para a interface num 400. */
export class ExportQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportQueryError';
  }
}

export interface ExportRequest {
  format: ExportFormat;
  from: IsoDate;
  to: IsoDate;
  sections: SectionId[];
  /** O que foi ajustado no pedido (ex.: data futura limitada a hoje), para avisar no arquivo. */
  adjustments: string[];
}

/** Período padrão: do 1º dia do mês de 2 meses atrás até hoje. */
export function defaultPeriod(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: monthRange(shiftMonth(monthOf(today), -2)).from, to: today };
}

const FORMAT_LIST = EXPORT_FORMATS.join(', ');

/** Texto opcional; repetido na URL (`?format=a&format=b`) vira array e é recusado. */
const optionalText = (field: string) =>
  z
    .string({ error: `Informe "${field}" uma vez só` })
    .trim()
    .optional();

const querySchema = z.object({
  format: optionalText('format'),
  from: optionalText('from'),
  to: optionalText('to'),
  sections: optionalText('sections'),
});

/**
 * Valida e completa a query de `GET /api/export`. Datas no futuro viram hoje;
 * período invertido, maior que 24 meses ou seção desconhecida são recusados.
 */
export function parseExportQuery(query: unknown, today: IsoDate): ExportRequest {
  const parsed = querySchema.safeParse(query ?? {});
  if (!parsed.success) throw new ExportQueryError(parsed.error.issues[0]!.message);
  const raw = parsed.data;

  if (!raw.format) throw new ExportQueryError(`Informe o formato (format): ${FORMAT_LIST}`);
  if (!(EXPORT_FORMATS as readonly string[]).includes(raw.format)) {
    throw new ExportQueryError(`Formato "${raw.format}" inválido. Use ${FORMAT_LIST}`);
  }
  const format = raw.format as ExportFormat;

  const adjustments: string[] = [];
  const date = (value: string | undefined, label: string): IsoDate | undefined => {
    if (!value) return undefined;
    if (!isIsoDate(value)) {
      throw new ExportQueryError(`Data ${label} inválida: "${value}". Use AAAA-MM-DD`);
    }
    if (value > today) {
      adjustments.push(
        `A data ${label} pedida (${value.split('-').reverse().join('/')}) está no futuro e foi trocada por hoje.`,
      );
      return today;
    }
    return value;
  };
  const requestedFrom = date(raw.from, 'inicial');
  const requestedTo = date(raw.to, 'final');
  const to = requestedTo ?? today;
  const from = requestedFrom ?? (requestedTo ? defaultPeriod(to).from : defaultPeriod(today).from);

  if (to < from) {
    throw new ExportQueryError('A data final deve ser igual ou posterior à data inicial');
  }
  if (monthsInRange(from, to).length > MAX_EXPORT_MONTHS) {
    throw new ExportQueryError(
      `O período pode ter no máximo ${MAX_EXPORT_MONTHS} meses. Diminua o intervalo entre as datas`,
    );
  }

  return { format, from, to, sections: parseSections(raw.sections), adjustments };
}

function parseSections(value: string | undefined): SectionId[] {
  if (value === undefined) return [...SECTION_IDS];
  const requested = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (requested.length === 0) throw new ExportQueryError('Escolha pelo menos uma seção');
  const unknown = requested.filter((id) => !(SECTION_IDS as readonly string[]).includes(id));
  if (unknown.length > 0) {
    throw new ExportQueryError(
      `Seção desconhecida: ${unknown.join(', ')}. Use: ${SECTION_IDS.join(', ')}`,
    );
  }
  return SECTION_IDS.filter((id) => requested.includes(id));
}
