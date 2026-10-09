"use client"

import { Info } from "lucide-react"
import { useState, type ComponentProps } from "react"
import { toast } from "sonner"
import type { DialogContent } from "@/components/ui/dialog"
import { FieldError, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiRequest } from "@/lib/api/client"
import type { Goal } from "@/lib/api/planning"
import type { Account, IsoDate } from "@/lib/api/types"
import { formatMonthShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { goalPreview, savedToast } from "./copy"
import { focusFirstError, FormDialog, FormField, MoneyInput } from "./form-dialog"
import {
  GOAL_FIELDS,
  goalForm,
  goalPatch,
  goalYears,
  validateGoal,
  type FieldErrors,
  type GoalField,
  type GoalForm,
} from "./forms"
import { goalProgress } from "./model"
import { useMutation } from "./use-mutation"

export type GoalAccount = Pick<Account, "id" | "name" | "institutionName" | "type">

const NO_ACCOUNT = "none"
const monthNames = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const value = String(i + 1).padStart(2, "0")
  const label = monthNames.format(new Date(Date.UTC(2026, i, 15)))
  return { value, label: label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1) }
})

/** Prévia com os valores digitados (null enquanto faltam dados válidos). */
function previewOf(form: GoalForm, today: IsoDate): string | null {
  const result = validateGoal({ ...form, name: form.name.trim() || "meta" })
  if (!result.ok) return null
  const progress = goalProgress({ id: "", ...result.value }, today, [])
  return goalPreview(progress, formatMoney, (month) => formatMonthShort(month, true))
}

export function GoalDialog({
  open,
  onOpenChange,
  goal,
  accounts,
  today,
  onDelete,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = nova meta. */
  goal: Goal | null
  accounts: GoalAccount[]
  today: IsoDate
  onDelete: (trigger: HTMLElement) => void
  onCloseAutoFocus: ComponentProps<typeof DialogContent>["onCloseAutoFocus"]
}) {
  const [form, setForm] = useState<GoalForm>(() => goalForm(goal))
  const [errors, setErrors] = useState<FieldErrors<GoalField>>({})
  const mutation = useMutation()
  const years = goalYears(today, form.targetYear)
  // Guardar dinheiro em cartão de crédito não faz sentido; a conta já escolhida continua na lista.
  const accountOptions = accounts.filter((account) => account.type !== "CREDIT_CARD" || account.id === goal?.accountId)
  const preview = previewOf(form, today)

  function update<K extends keyof GoalForm>(field: K, value: GoalForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    if (field in errors) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function submit() {
    const result = validateGoal(form)
    if (!result.ok) {
      setErrors(result.errors)
      focusFirstError("goal", GOAL_FIELDS, result.errors)
      return
    }
    setErrors({})
    const body = goal ? goalPatch(goal, result.value) : result.value
    if (goal && Object.keys(body).length === 0) {
      onOpenChange(false)
      return
    }
    mutation.run(
      () =>
        goal
          ? apiRequest(`/api/planning/goals/${goal.id}`, { method: "PATCH", body })
          : apiRequest("/api/planning/goals", { method: "POST", body }),
      {
        action: "salvar",
        onSuccess: () => {
          onOpenChange(false)
          toast.success(savedToast("goal", result.value.name, !goal))
        },
      },
    )
  }

  const deadlineError = errors.targetMonth ?? errors.targetYear

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? "Editar meta" : "Nova meta"}
      description="Quanto juntar, até quando e quanto guardar por mês. O aporte entra na projeção."
      pending={mutation.pending}
      error={mutation.error}
      submitLabel={goal ? "Salvar" : "Criar meta"}
      onSubmit={submit}
      onDelete={goal ? onDelete : undefined}
      deleteLabel={goal?.name}
      focusFirstField={!goal}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <FieldGroup className="gap-5">
        <FormField id="goal-name" label="Nome" error={errors.name}>
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              maxLength={80}
              placeholder="Ex.: Entrada do carro, reserva de emergência"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          )}
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="goal-target" label="Valor da meta" error={errors.target}>
            {(control) => <MoneyInput {...control} value={form.target} onValueChange={(value) => update("target", value)} />}
          </FormField>
          <FormField id="goal-saved" label="Já guardado" optional error={errors.saved}>
            {(control) => <MoneyInput {...control} value={form.saved} onValueChange={(value) => update("saved", value)} />}
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="goal-monthlyContribution" label="Aporte mensal" error={errors.monthlyContribution}>
            {(control) => (
              <MoneyInput
                {...control}
                value={form.monthlyContribution}
                onValueChange={(value) => update("monthlyContribution", value)}
              />
            )}
          </FormField>

          <FieldSet data-invalid={deadlineError ? true : undefined} className="min-w-0 gap-2">
            <FieldLegend variant="label" className="mb-0 data-[variant=label]:text-sm">
              Prazo
            </FieldLegend>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
              <Select value={form.targetMonth} onValueChange={(value) => update("targetMonth", value)}>
                <SelectTrigger
                  id="goal-targetMonth"
                  aria-label="Mês do prazo"
                  aria-invalid={errors.targetMonth ? true : undefined}
                  aria-describedby={deadlineError ? "goal-deadline-error" : undefined}
                  className="w-full"
                >
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={form.targetYear} onValueChange={(value) => update("targetYear", value)}>
                <SelectTrigger
                  id="goal-targetYear"
                  aria-label="Ano do prazo"
                  aria-invalid={errors.targetYear ? true : undefined}
                  aria-describedby={deadlineError ? "goal-deadline-error" : undefined}
                  className="w-full tabular-nums"
                >
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FieldError id="goal-deadline-error" className="text-xs">
              {deadlineError && (errors.targetMonth && errors.targetYear ? "Escolha o mês e o ano do prazo." : deadlineError)}
            </FieldError>
          </FieldSet>
        </div>

        <FormField id="goal-accountId" label="Conta onde guarda" optional>
          {(control) => (
            <Select
              value={form.accountId || NO_ACCOUNT}
              onValueChange={(value) => update("accountId", value === NO_ACCOUNT ? "" : value)}
            >
              <SelectTrigger {...control} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Nenhuma</SelectItem>
                {accountOptions.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                    <span className="text-muted-foreground">· {account.institutionName}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        {preview && (
          <p className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-md px-3 py-2.5 text-xs">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>{preview}</span>
          </p>
        )}
      </FieldGroup>
    </FormDialog>
  )
}
