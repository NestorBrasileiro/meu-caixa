"use client"

import { useState, type ComponentProps } from "react"
import { toast } from "sonner"
import { PAYMENT_METHOD_LABEL } from "@/components/finance/payment-method"
import type { DialogContent } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { apiRequest } from "@/lib/api/client"
import type { BudgetCategory, Commitment } from "@/lib/api/planning"
import type { IsoDate, PaymentMethod } from "@/lib/api/types"
import { formatMonthShort } from "@/lib/format/date"
import { savedToast } from "./copy"
import { focusFirstError, FormDialog, FormField, MoneyInput } from "./form-dialog"
import {
  COMMITMENT_FIELDS,
  commitmentForm,
  commitmentPatch,
  isIsoDate,
  lastInstallmentMonth,
  NOTES_MAX,
  validateCommitment,
  type CommitmentField,
  type CommitmentForm,
  type FieldErrors,
} from "./forms"
import { useMutation } from "./use-mutation"

/** Ordem do seletor: os mais comuns em contas fixas primeiro. */
const METHOD_ORDER: PaymentMethod[] = ["PIX", "BOLETO", "CARD", "TED", "DOC", "OTHER"]
const NO_CATEGORY = "none"

export function CommitmentDialog({
  open,
  onOpenChange,
  commitment,
  categories,
  today,
  onDelete,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = novo compromisso. */
  commitment: Commitment | null
  categories: BudgetCategory[]
  today: IsoDate
  onDelete: (trigger: HTMLElement) => void
  onCloseAutoFocus: ComponentProps<typeof DialogContent>["onCloseAutoFocus"]
}) {
  const [form, setForm] = useState<CommitmentForm>(() => commitmentForm(commitment, today))
  const [errors, setErrors] = useState<FieldErrors<CommitmentField>>({})
  const mutation = useMutation()

  function update<K extends keyof CommitmentForm>(field: K, value: CommitmentForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    if (field in errors) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function submit() {
    const result = validateCommitment(form)
    if (!result.ok) {
      setErrors(result.errors)
      focusFirstError("commitment", COMMITMENT_FIELDS, result.errors)
      return
    }
    setErrors({})
    const body = commitment ? commitmentPatch(commitment, result.value) : result.value
    if (commitment && Object.keys(body).length === 0) {
      onOpenChange(false)
      return
    }
    mutation.run(
      () =>
        commitment
          ? apiRequest(`/api/planning/commitments/${commitment.id}`, { method: "PATCH", body })
          : apiRequest("/api/planning/commitments", { method: "POST", body }),
      {
        action: "salvar",
        onSuccess: () => {
          onOpenChange(false)
          toast.success(savedToast("commitment", result.value.name, !commitment))
        },
      },
    )
  }

  const total = Number(form.installmentsTotal)
  const day = Number(form.dayOfMonth)
  const lastMonth =
    form.installments &&
    isIsoDate(form.startsOn) &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= 31 &&
    Number.isInteger(total) &&
    total >= 1 &&
    total <= 600
      ? lastInstallmentMonth(form.startsOn, day, total)
      : null

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={commitment ? "Editar compromisso" : "Novo compromisso fixo"}
      description="Conta que se repete todo mês. Entra na projeção enquanto estiver ativa."
      pending={mutation.pending}
      error={mutation.error}
      submitLabel={commitment ? "Salvar" : "Adicionar"}
      onSubmit={submit}
      onDelete={commitment ? onDelete : undefined}
      deleteLabel={commitment?.name}
      focusFirstField={!commitment}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <FieldGroup className="gap-5">
        <FormField id="commitment-name" label="Nome" error={errors.name}>
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              maxLength={80}
              placeholder="Ex.: Aluguel, academia, parcela do carro"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          )}
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="commitment-amount" label="Valor" error={errors.amount}>
            {(control) => (
              <MoneyInput {...control} value={form.amount} onValueChange={(value) => update("amount", value)} />
            )}
          </FormField>
          <FormField id="commitment-dayOfMonth" label="Vence todo dia" error={errors.dayOfMonth}>
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                autoComplete="off"
                maxLength={2}
                placeholder="1 a 31"
                className="tabular-nums"
                value={form.dayOfMonth}
                onChange={(event) => update("dayOfMonth", event.target.value.replace(/\D/g, ""))}
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="commitment-paymentMethod"
            label="Forma de pagamento"
            description={form.paymentMethod === "CARD" ? "Cai na fatura do cartão de crédito." : undefined}
          >
            {(control) => (
              <Select value={form.paymentMethod} onValueChange={(value) => update("paymentMethod", value as PaymentMethod)}>
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_ORDER.map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_METHOD_LABEL[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField id="commitment-categoryId" label="Categoria de orçamento" error={errors.categoryId}>
            {(control) => (
              <Select
                value={form.categoryId || NO_CATEGORY}
                onValueChange={(value) => update("categoryId", value === NO_CATEGORY ? "" : value)}
              >
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>

        <Field orientation="horizontal" className="gap-3">
          <Switch
            id="commitment-installments"
            checked={form.installments}
            onCheckedChange={(checked) => {
              update("installments", checked)
              setErrors((current) => ({ ...current, installmentsTotal: undefined, endsOn: undefined }))
            }}
            aria-describedby="commitment-installments-description"
          />
          <FieldContent className="gap-0.5">
            <FieldLabel htmlFor="commitment-installments">Parcelado</FieldLabel>
            <FieldDescription id="commitment-installments-description" className="text-xs">
              {form.installments
                ? "O fim sai do total de parcelas, contadas a partir do início."
                : "Financiamento ou compra em parcelas com número certo de meses."}
            </FieldDescription>
          </FieldContent>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="commitment-startsOn" label="Começa em" error={errors.startsOn}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={form.startsOn}
                onChange={(event) => update("startsOn", event.target.value)}
              />
            )}
          </FormField>
          {form.installments ? (
            <FormField
              id="commitment-installmentsTotal"
              label="Total de parcelas"
              error={errors.installmentsTotal}
              description={lastMonth ? `Última em ${formatMonthShort(lastMonth, true)}.` : undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={3}
                  placeholder="Ex.: 120"
                  className="tabular-nums"
                  value={form.installmentsTotal}
                  onChange={(event) => update("installmentsTotal", event.target.value.replace(/\D/g, ""))}
                />
              )}
            </FormField>
          ) : (
            <FormField
              id="commitment-endsOn"
              label="Termina em"
              optional
              error={errors.endsOn}
              description={form.endsOn ? undefined : "Em branco: sem data para acabar."}
            >
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  min={form.startsOn || undefined}
                  value={form.endsOn}
                  onChange={(event) => update("endsOn", event.target.value)}
                />
              )}
            </FormField>
          )}
        </div>

        <FormField
          id="commitment-notes"
          label="Observações"
          optional
          error={errors.notes}
          description={form.notes.length > NOTES_MAX - 40 ? `${form.notes.length} de ${NOTES_MAX} caracteres.` : undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={2}
              maxLength={NOTES_MAX}
              placeholder="Ex.: Loteadora, contrato 1234"
              className="min-h-16"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          )}
        </FormField>
      </FieldGroup>
    </FormDialog>
  )
}
