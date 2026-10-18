import { describe, expect, it } from "vitest"
import { parseItemIds, validatePluggyForm } from "./pluggy-form"

const ITEM = "236ebd9f-db05-4098-b7ed-f49eba8ab770"
const OTHER = "e39bdff2-2e31-4590-938c-aa91ccf096f0"

describe("parseItemIds", () => {
  it("aceita um por linha, vírgula ou espaço e tira repetidos", () => {
    expect(parseItemIds(`${ITEM}\n${OTHER}, ${ITEM}  `)).toEqual([ITEM, OTHER])
  })

  it("texto vazio vira lista vazia", () => {
    expect(parseItemIds("  \n ")).toEqual([])
  })
})

describe("validatePluggyForm", () => {
  const form = { clientId: " client ", clientSecret: " segredo ", itemIds: ITEM }

  it("monta o corpo com os valores limpos", () => {
    expect(validatePluggyForm(form, false)).toEqual({
      ok: true,
      input: { clientId: "client", clientSecret: "segredo", itemIds: [ITEM] },
    })
  })

  it("sem segredo novo, só passa se já houver um salvo (e não manda o campo)", () => {
    const blank = { ...form, clientSecret: "" }
    expect(validatePluggyForm(blank, true)).toEqual({ ok: true, input: { clientId: "client", itemIds: [ITEM] } })
    expect(validatePluggyForm(blank, false)).toMatchObject({ ok: false, errors: { clientSecret: expect.any(String) } })
  })

  it("aponta campos vazios e item fora do formato", () => {
    expect(validatePluggyForm({ clientId: "", clientSecret: "", itemIds: "" }, false)).toEqual({
      ok: false,
      errors: {
        clientId: "Informe o Client ID.",
        clientSecret: "Informe o Client Secret.",
        itemIds: "Informe ao menos um Item ID.",
      },
    })
    expect(validatePluggyForm({ ...form, itemIds: "abc" }, false)).toMatchObject({
      ok: false,
      errors: { itemIds: expect.stringContaining('"abc"') },
    })
  })
})
