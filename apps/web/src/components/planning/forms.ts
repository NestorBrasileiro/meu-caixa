import type {
  BudgetCategory,
  BudgetCategoryInput,
  BudgetCategoryPatch,
  CategoryKind,
  Commitment,
  CommitmentInput,
  CommitmentPatch,
  Goal,
  GoalInput,
  GoalPatch,
} from "@/lib/api/planning"
import type { Cents, IsoDate, PaymentMethod } from "@/lib/api/types"
import { installmentDueDate } from "./schedule"

/**
 * Regras dos formulários do planejamento (funções puras): leitura do que foi
 * digitado, validação com as mesmas regras da API, corpo do POST e diferença
 * para o PATCH. Mensagens em pt-BR, prontas para o `FieldError`.
 */

/** Teto de sanidade da API para valores em centavos (R$ 100 milhões). */
export const MAX_CENTS = 10_000_000_000

export type FieldErrors<K extends string> = Partial<Record<K, string>>

export type Validation<T, K extends string> = { ok: true; value: T } | { ok: false; errors: FieldErrors<K> }

// ------------------------------------------------------------------ dinheiro

const MONEY_PATTERNS = [
  /^\d+$/, // 2300
  /^\d{1,3}(?:\.\d{3})+$/, // 2.300 · 1.234.567
  /^\d{1,3}(?:\.\d{3})*,\d{1,2}$/, // 2.300,00
  /^\d*,\d{1,2}$/, // 2300,5 · ,50
  /^\d+\.\d{1,2}$/, // 2300.50 (teclado em inglês)
]

/**
 * Valor digitado em reais → centavos. Aceita "2.300,00", "2300", "2.300",
 * "2300,5", "R$ 2.300,00" e "2300.50". null se vazio ou fora desses formatos.
 * Ponto seguido de 3 dígitos é separador de milhar; com 1–2 dígitos, decimal.
 */
export function parseMoney(input: string): Cents | null {
  const text = input.replace(/R\$/gi, "").replace(/[\s ]/g, "")
  if (!/\d/.test(text) || !MONEY_PATTERNS.some((pattern) => pattern.test(text))) return null
  let integer = text
  let fraction = ""
  if (text.includes(",")) {
    ;[integer, fraction] = text.split(",")
    integer = integer.replace(/\./g, "")
  } else if (/\.\d{1,2}$/.test(text)) {
    ;[integer, fraction] = text.split(".")
  } else {
    integer = text.replace(/\./g, "")
  }
  return Number(integer || "0") * 100 + Number(fraction.padEnd(2, "0"))
}

const moneyInput = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Centavos → "2.300,00" (o "R$" fica no prefixo do campo). */
export function formatMoneyInput(cents: Cents): string {
  return moneyInput.format(cents / 100)
}

/** Reescreve o valor no formato canônico ao sair do campo; mantém o texto se não for válido. */
export function normalizeMoneyInput(input: string): string {
  const cents = parseMoney(input)
  return cents === null ? input : formatMoneyInput(cents)
}

function moneyError(
  input: string,
  { required, min, label }: { required: boolean; min: number; label: string },
): { cents: Cents | null; error?: string } {
  if (input.trim() === "") return required ? { cents: null, error: `Informe ${label}.` } : { cents: null }
  const cents = parseMoney(input)
  if (cents === null) return { cents: null, error: "Valor inválido. Use o formato 2.300,00." }
  if (cents < min) return { cents, error: min > 0 ? "O valor precisa ser maior que zero." : "Valor inválido." }
  if (cents > MAX_CENTS) return { cents, error: "O valor passa do limite de R$ 100 milhões." }
  return { cents }
}

// -------------------------------------------------------------------- datas

/** `YYYY-MM-DD` válido de calendário (o que um `<input type="date">` entrega). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * Mês (`YYYY-MM`) da última parcela, como a API calcula: o vencimento da 1ª
 * (no mês do início, ou no seguinte se o dia já passou) + (total − 1) meses.
 */
export function lastInstallmentMonth(startsOn: IsoDate, dayOfMonth: number, total: number): string {
  return installmentDueDate(startsOn, dayOfMonth, total).slice(0, 7)
}

function integerIn(input: string, min: number, max: number): number | null {
  const text = input.trim()
  if (!/^\d{1,4}$/.test(text)) return null
  const value = Number(text)
  return value >= min && value <= max ? value : null
}

function nameError(name: string, max: number): string | undefined {
  const trimmed = name.trim()
  if (trimmed === "") return "Informe um nome."
  if (trimmed.length > max) return `Use até ${max} caracteres.`
  return undefined
}

function sameStrings(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((value, i) => value === sortedB[i])
}

// -------------------------------------------------------------- compromissos

export interface CommitmentForm {
  name: string
  amount: string
  dayOfMonth: string
  paymentMethod: PaymentMethod
  /** "" = sem categoria. */
  categoryId: string
  startsOn: string
  /** Parcelado: o fim sai do total de parcelas (a API calcula). */
  installments: boolean
  installmentsTotal: string
  endsOn: string
  notes: string
}

export type CommitmentField = Exclude<keyof CommitmentForm, "installments">

export const COMMITMENT_FIELDS: CommitmentField[] = [
  "name",
  "amount",
  "dayOfMonth",
  "paymentMethod",
  "categoryId",
  "startsOn",
  "installmentsTotal",
  "endsOn",
  "notes",
]

export const NOTES_MAX = 200

/** Estado inicial do formulário: vazio (com início hoje) ou a partir de um compromisso. */
export function commitmentForm(commitment: Commitment | null, today: IsoDate): CommitmentForm {
  if (!commitment) {
    return {
      name: "",
      amount: "",
      dayOfMonth: "",
      paymentMethod: "PIX",
      categoryId: "",
      startsOn: today,
      installments: false,
      installmentsTotal: "",
      endsOn: "",
      notes: "",
    }
  }
  return {
    name: commitment.name,
    amount: formatMoneyInput(commitment.amount),
    dayOfMonth: String(commitment.dayOfMonth),
    paymentMethod: commitment.paymentMethod,
    categoryId: commitment.categoryId ?? "",
    startsOn: commitment.startsOn,
    installments: commitment.installments !== null,
    installmentsTotal: commitment.installments ? String(commitment.installments.total) : "",
    // Parcelado: o fim que a API devolve é derivado das parcelas, não um campo do formulário.
    endsOn: commitment.installments ? "" : (commitment.endsOn ?? ""),
    notes: commitment.notes ?? "",
  }
}

export function validateCommitment(form: CommitmentForm): Validation<CommitmentInput, CommitmentField> {
  const errors: FieldErrors<CommitmentField> = {}

  const name = nameError(form.name, 80)
  if (name) errors.name = name

  const amount = moneyError(form.amount, { required: true, min: 1, label: "o valor" })
  if (amount.error) errors.amount = amount.error

  const day = integerIn(form.dayOfMonth, 1, 31)
  if (day === null) errors.dayOfMonth = "Informe um dia entre 1 e 31."

  if (form.startsOn === "") errors.startsOn = "Informe a data de início."
  else if (!isIsoDate(form.startsOn)) errors.startsOn = "Data inválida."

  let installmentsTotal: number | null = null
  let endsOn: IsoDate | null = null
  if (form.installments) {
    installmentsTotal = integerIn(form.installmentsTotal, 1, 600)
    if (installmentsTotal === null) errors.installmentsTotal = "Informe de 1 a 600 parcelas."
  } else if (form.endsOn !== "") {
    if (!isIsoDate(form.endsOn)) errors.endsOn = "Data inválida."
    else if (isIsoDate(form.startsOn) && form.endsOn < form.startsOn)
      errors.endsOn = "O fim precisa ser no mesmo dia do início ou depois."
    else endsOn = form.endsOn
  }

  const notes = form.notes.trim()
  if (notes.length > NOTES_MAX) errors.notes = `Use até ${NOTES_MAX} caracteres.`

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name: form.name.trim(),
      amount: amount.cents!,
      dayOfMonth: day!,
      paymentMethod: form.paymentMethod,
      categoryId: form.categoryId || null,
      startsOn: form.startsOn,
      endsOn,
      installmentsTotal,
      notes: notes || null,
    },
  }
}

/** Só o que mudou em relação ao compromisso salvo (vazio = nada a enviar). */
export function commitmentPatch(initial: Commitment, next: CommitmentInput): CommitmentPatch {
  const patch: CommitmentPatch = {}
  if (next.name !== initial.name) patch.name = next.name
  if (next.amount !== initial.amount) patch.amount = next.amount
  if (next.dayOfMonth !== initial.dayOfMonth) patch.dayOfMonth = next.dayOfMonth
  if (next.paymentMethod !== initial.paymentMethod) patch.paymentMethod = next.paymentMethod
  if (next.categoryId !== initial.categoryId) patch.categoryId = next.categoryId
  if (next.startsOn !== initial.startsOn) patch.startsOn = next.startsOn
  if (next.notes !== (initial.notes ?? null)) patch.notes = next.notes

  const wasInstallments = initial.installments !== null
  if (next.installmentsTotal !== null) {
    // Parcelado: o fim volta a ser derivado das parcelas.
    if (!wasInstallments || next.installmentsTotal !== initial.installments!.total) {
      patch.installmentsTotal = next.installmentsTotal
      patch.endsOn = null
    }
  } else if (wasInstallments) {
    patch.installmentsTotal = null
    patch.endsOn = next.endsOn
  } else if (next.endsOn !== initial.endsOn) {
    patch.endsOn = next.endsOn
  }
  return patch
}

// -------------------------------------------------------------------- metas

export interface GoalForm {
  name: string
  target: string
  saved: string
  monthlyContribution: string
  /** "01".."12" ("" = não escolhido) */
  targetMonth: string
  /** "2027" ("" = não escolhido) */
  targetYear: string
  /** "" = nenhuma conta. */
  accountId: string
}

export type GoalField = keyof GoalForm

export const GOAL_FIELDS: GoalField[] = [
  "name",
  "target",
  "saved",
  "monthlyContribution",
  "targetMonth",
  "targetYear",
  "accountId",
]

export function goalForm(goal: Goal | null): GoalForm {
  if (!goal) {
    return { name: "", target: "", saved: "", monthlyContribution: "", targetMonth: "", targetYear: "", accountId: "" }
  }
  return {
    name: goal.name,
    target: formatMoneyInput(goal.target),
    saved: formatMoneyInput(goal.saved),
    monthlyContribution: formatMoneyInput(goal.monthlyContribution),
    targetMonth: goal.targetDate.slice(5, 7),
    targetYear: goal.targetDate.slice(0, 4),
    accountId: goal.accountId ?? "",
  }
}

/** Anos oferecidos no prazo: do ano atual (ou do prazo salvo, se anterior) até 30 anos à frente. */
export function goalYears(today: IsoDate, current: string): string[] {
  const thisYear = Number(today.slice(0, 4))
  const first = current && Number(current) < thisYear ? Number(current) : thisYear
  return Array.from({ length: thisYear + 30 - first + 1 }, (_, i) => String(first + i))
}

export function validateGoal(form: GoalForm): Validation<GoalInput, GoalField> {
  const errors: FieldErrors<GoalField> = {}

  const name = nameError(form.name, 80)
  if (name) errors.name = name

  const target = moneyError(form.target, { required: true, min: 1, label: "o valor da meta" })
  if (target.error) errors.target = target.error

  const saved = moneyError(form.saved, { required: false, min: 0, label: "quanto já foi guardado" })
  if (saved.error) errors.saved = saved.error

  const contribution = moneyError(form.monthlyContribution, {
    required: true,
    min: 0,
    label: "o aporte mensal (pode ser 0)",
  })
  if (contribution.error) errors.monthlyContribution = contribution.error

  if (!/^(0[1-9]|1[0-2])$/.test(form.targetMonth)) errors.targetMonth = "Escolha o mês do prazo."
  if (!/^\d{4}$/.test(form.targetYear)) errors.targetYear = "Escolha o ano do prazo."

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name: form.name.trim(),
      target: target.cents!,
      saved: saved.cents ?? 0,
      targetDate: `${form.targetYear}-${form.targetMonth}-01`,
      monthlyContribution: contribution.cents!,
      accountId: form.accountId || null,
    },
  }
}

export function goalPatch(initial: Goal, next: GoalInput): GoalPatch {
  const patch: GoalPatch = {}
  if (next.name !== initial.name) patch.name = next.name
  if (next.target !== initial.target) patch.target = next.target
  if (next.saved !== initial.saved) patch.saved = next.saved
  if (next.monthlyContribution !== initial.monthlyContribution) patch.monthlyContribution = next.monthlyContribution
  // O formulário escolhe o mês: só muda a data se o mês mudou (preserva o dia salvo).
  if (next.targetDate.slice(0, 7) !== initial.targetDate.slice(0, 7)) patch.targetDate = next.targetDate
  if (next.accountId !== initial.accountId) patch.accountId = next.accountId
  return patch
}

// --------------------------------------------------------------- categorias

export interface CategoryForm {
  name: string
  kind: CategoryKind
  /** "" = sem teto (só acompanha o gasto). */
  monthlyBudget: string
  sourceCategories: string[]
}

export type CategoryField = keyof CategoryForm

export const CATEGORY_FIELDS: CategoryField[] = ["name", "kind", "monthlyBudget", "sourceCategories"]

export const SOURCE_CATEGORIES_MAX = 50

export function categoryForm(category: BudgetCategory | null): CategoryForm {
  if (!category) return { name: "", kind: "ESSENTIAL", monthlyBudget: "", sourceCategories: [] }
  return {
    name: category.name,
    kind: category.kind,
    monthlyBudget: category.monthlyBudget === null ? "" : formatMoneyInput(category.monthlyBudget),
    sourceCategories: [...category.sourceCategories],
  }
}

export function validateCategory(form: CategoryForm): Validation<BudgetCategoryInput, CategoryField> {
  const errors: FieldErrors<CategoryField> = {}

  const name = nameError(form.name, 60)
  if (name) errors.name = name

  // Vazio = sem teto; R$ 0,00 não é teto (a API exige pelo menos 1 centavo).
  const budget = moneyError(form.monthlyBudget, { required: false, min: 1, label: "o teto mensal" })
  if (budget.error)
    errors.monthlyBudget =
      budget.cents === 0 ? "Use pelo menos R$ 0,01 ou deixe em branco para não ter teto." : budget.error

  if (form.sourceCategories.length > SOURCE_CATEGORIES_MAX)
    errors.sourceCategories = `Escolha até ${SOURCE_CATEGORIES_MAX} categorias.`

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name: form.name.trim(),
      kind: form.kind,
      sourceCategories: [...new Set(form.sourceCategories)],
      monthlyBudget: budget.cents,
    },
  }
}

export interface SourceChoice {
  value: string
  label: string
  /** Outras categorias do orçamento que já usam esta (o gasto somaria duas vezes). */
  usedIn: string[]
}

/**
 * Opções da lista de categorias do banco, separadas em livres e já usadas em
 * outra categoria do orçamento. Não depende do que está marcado: marcar não
 * faz o item trocar de grupo. Valores salvos que não estão nas opções entram
 * também (com o rótulo de `label`).
 */
export function sourceChoices(
  options: { value: string; label: string }[],
  selected: string[],
  categories: Pick<BudgetCategory, "id" | "name" | "sourceCategories">[],
  currentId: string | null,
  label: (value: string) => string,
): { free: SourceChoice[]; taken: SourceChoice[] } {
  const usedIn = new Map<string, string[]>()
  for (const category of categories) {
    if (category.id === currentId) continue
    for (const source of category.sourceCategories) usedIn.set(source, [...(usedIn.get(source) ?? []), category.name])
  }
  const missing = selected.filter((value) => !options.some((option) => option.value === value))
  const all = [...options, ...missing.map((value) => ({ value, label: label(value) }))].map((option) => ({
    ...option,
    usedIn: usedIn.get(option.value) ?? [],
  }))
  return {
    free: all.filter((choice) => choice.usedIn.length === 0),
    taken: all.filter((choice) => choice.usedIn.length > 0),
  }
}

export function categoryPatch(initial: BudgetCategory, next: BudgetCategoryInput): BudgetCategoryPatch {
  const patch: BudgetCategoryPatch = {}
  if (next.name !== initial.name) patch.name = next.name
  if (next.kind !== initial.kind) patch.kind = next.kind
  if (next.monthlyBudget !== initial.monthlyBudget) patch.monthlyBudget = next.monthlyBudget
  if (!sameStrings(next.sourceCategories, initial.sourceCategories)) patch.sourceCategories = next.sourceCategories
  return patch
}

// ---------------------------------------------------------------------- erros

/**
 * Mensagem para o usuário a partir do erro de `apiRequest` (ClientApiError tem
 * `status`; falha de rede chega como TypeError). Erros de validação da API vêm
 * em inglês (class-validator) e viram uma frase genérica em pt-BR.
 */
export function mutationErrorMessage(error: unknown, action: "salvar" | "excluir"): string {
  const status =
    typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : null
  const message = error instanceof Error ? error.message : ""
  if (status === null) return `Não foi possível ${action}: sem resposta do servidor. Verifique a conexão e tente de novo.`
  if (status === 400 && /não existe/i.test(message))
    return "A categoria ou a conta escolhida não existe mais. Atualize a página e escolha de novo."
  if (status === 400) return "A API não aceitou algum valor. Confira os campos e tente de novo."
  if (status === 401) return "Sua sessão expirou. Entre de novo para continuar."
  if (status === 403) return `Seu usuário não tem permissão para ${action} no planejamento.`
  if (status === 404) return "Este item não existe mais (talvez tenha sido excluído em outra aba). Atualize a página."
  if (status >= 500) return `O servidor não conseguiu ${action} agora. Tente de novo em instantes.`
  return message || `Não foi possível ${action}. Tente de novo.`
}
