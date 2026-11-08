import type { PluggySettingsInput } from "@/lib/api/settings"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PluggyForm {
  clientId: string
  clientSecret: string
  itemIds: string
}

export type PluggyField = keyof PluggyForm

/** Item IDs colados um por linha, por vírgula ou espaço; sem repetidos. */
export function parseItemIds(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).filter(Boolean))]
}

export function validatePluggyForm(
  form: PluggyForm,
  secretSaved: boolean,
): { ok: true; input: PluggySettingsInput } | { ok: false; errors: Partial<Record<PluggyField, string>> } {
  const errors: Partial<Record<PluggyField, string>> = {}
  const clientId = form.clientId.trim()
  const clientSecret = form.clientSecret.trim()
  const itemIds = parseItemIds(form.itemIds)

  if (!clientId) errors.clientId = "Informe o Client ID."
  if (!clientSecret && !secretSaved) errors.clientSecret = "Informe o Client Secret."
  if (itemIds.length === 0) errors.itemIds = "Informe ao menos um Item ID."
  else {
    const invalid = itemIds.find((id) => !UUID.test(id))
    if (invalid) errors.itemIds = `"${invalid}" não é um Item ID (formato 0000aaaa-…).`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, input: { clientId, itemIds, ...(clientSecret ? { clientSecret } : {}) } }
}
