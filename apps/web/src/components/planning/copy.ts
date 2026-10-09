import type { BudgetCategory, Commitment, Goal } from "@/lib/api/planning"
import type { Cents } from "@/lib/api/types"
import { listJoin, plural, type GoalProgress } from "./model"

/**
 * Textos das ações de escrita (funções puras): confirmação de exclusão,
 * toasts e a prévia da meta. Recebem os formatadores para ficarem testáveis.
 */

export type EntityKind = "commitment" | "goal" | "category"

type Money = (cents: Cents) => string

export interface DeleteCopy {
  title: string
  description: string
  confirm: string
  success: string
}

export function deleteCommitmentCopy(commitment: Commitment, formatMoney: Money): DeleteCopy {
  return {
    title: `Excluir “${commitment.name}”?`,
    description: `O compromisso de ${formatMoney(commitment.amount)} por mês sai da lista e deixa de entrar na projeção. Isso não pode ser desfeito.`,
    confirm: "Excluir compromisso",
    success: `Compromisso “${commitment.name}” excluído`,
  }
}

export function deleteGoalCopy(goal: Goal, accountName: string | null, formatMoney: Money): DeleteCopy {
  const contribution =
    goal.monthlyContribution > 0 ? ` e o aporte de ${formatMoney(goal.monthlyContribution)}/mês saem` : " sai"
  const where = accountName ? `em ${accountName}` : "onde está"
  const saved = goal.saved > 0 ? ` Os ${formatMoney(goal.saved)} já guardados continuam ${where}.` : ""
  return {
    title: `Excluir a meta “${goal.name}”?`,
    description: `A meta${contribution} do planejamento e da projeção.${saved} Isso não pode ser desfeito.`,
    confirm: "Excluir meta",
    success: `Meta “${goal.name}” excluída`,
  }
}

export function deleteCategoryCopy(
  category: BudgetCategory,
  sourceLabels: string[],
  commitmentNames: string[],
  formatMoney: Money,
): DeleteCopy {
  const parts: string[] = []
  if (category.monthlyBudget !== null) parts.push(`O teto de ${formatMoney(category.monthlyBudget)} sai do orçamento.`)
  if (sourceLabels.length > 0) parts.push(`O gasto em ${listJoin(sourceLabels)} passa a aparecer como fora do orçamento.`)
  if (commitmentNames.length === 1) parts.push(`O compromisso “${commitmentNames[0]}” fica sem categoria.`)
  else if (commitmentNames.length > 1)
    parts.push(`${plural(commitmentNames.length, "compromisso", "compromissos")} (${listJoin(commitmentNames)}) ficam sem categoria.`)
  parts.push("Isso não pode ser desfeito.")
  return {
    title: `Excluir a categoria “${category.name}”?`,
    description: parts.join(" "),
    confirm: "Excluir categoria",
    success: `Categoria “${category.name}” excluída`,
  }
}

/** Toast de sucesso ao salvar. */
export function savedToast(kind: EntityKind, name: string, created: boolean): string {
  if (kind === "commitment") return `Compromisso “${name}” ${created ? "adicionado" : "atualizado"}`
  if (kind === "goal") return `Meta “${name}” ${created ? "criada" : "atualizada"}`
  return `Categoria “${name}” ${created ? "adicionada" : "atualizada"}`
}

/** Prévia ao preencher a meta: quando fecha no ritmo informado e, se atrasa, o aporte que resolve. */
export function goalPreview(
  progress: Pick<GoalProgress, "done" | "monthlyContribution" | "projectedMonth" | "delayMonths" | "requiredMonthly" | "targetMonth">,
  formatMoney: Money,
  formatMonth: (month: string) => string,
): string {
  if (progress.done) return "Com o que já foi guardado, a meta está atingida."
  if (progress.projectedMonth === null) return "Sem aporte mensal, a meta não tem previsão de conclusão."
  const pace = `No ritmo de ${formatMoney(progress.monthlyContribution)}/mês, a meta fecha em ${formatMonth(progress.projectedMonth)}`
  if (!progress.delayMonths) return `${pace}, dentro do prazo.`
  const late = `${pace}, ${plural(progress.delayMonths, "mês", "meses")} depois do prazo.`
  return progress.requiredMonthly !== null
    ? `${late} Para chegar em ${formatMonth(progress.targetMonth)}, o aporte precisa ser de ${formatMoney(progress.requiredMonthly)}/mês.`
    : late
}
