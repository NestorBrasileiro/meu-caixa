import { describe, expect, it } from "vitest"
import { EXPORT_SECTIONS } from "@/lib/api/export"
import {
  buildExportPath,
  errorMessageFrom,
  exportErrorMessage,
  fallbackFilename,
  filenameFromDisposition,
} from "./request"

const PERIOD = { from: "2026-08-01", to: "2026-10-23" }

describe("buildExportPath", () => {
  it("monta a query do contrato, com as seções na ordem do catálogo", () => {
    expect(
      buildExportPath({ format: "xlsx", period: PERIOD, sections: ["transacoes", "resumo", "contas"] }, EXPORT_SECTIONS),
    ).toBe("/api/export?format=xlsx&from=2026-08-01&to=2026-10-23&sections=resumo,contas,transacoes")
  })

  it("ignora ids que não estão no catálogo", () => {
    expect(buildExportPath({ format: "md", period: PERIOD, sections: ["resumo", "x"] }, EXPORT_SECTIONS)).toBe(
      "/api/export?format=md&from=2026-08-01&to=2026-10-23&sections=resumo",
    )
  })

  it("todas as seções, na ordem do contrato", () => {
    const all = EXPORT_SECTIONS.map((section) => section.id)
    const path = buildExportPath({ format: "csv", period: PERIOD, sections: [...all].reverse() }, EXPORT_SECTIONS)
    expect(new URL(path, "http://x").searchParams.get("sections")).toBe(
      "resumo,contas,cartoes,faturas,parcelamentos,emprestimos,compromissos,metas,orcamento,projecao,fluxo,categorias,recorrencias,transacoes,analise",
    )
  })
})

describe("filenameFromDisposition", () => {
  it("filename entre aspas", () => {
    expect(filenameFromDisposition('attachment; filename="meu-caixa-2026-08-01-a-2026-10-23.xlsx"')).toBe(
      "meu-caixa-2026-08-01-a-2026-10-23.xlsx",
    )
  })

  it("filename sem aspas e com maiúsculas no nome do parâmetro", () => {
    expect(filenameFromDisposition("attachment; FileName=relatorio.pdf")).toBe("relatorio.pdf")
  })

  it("prefere filename* (UTF-8) ao filename simples, sem os acentos", () => {
    expect(
      filenameFromDisposition(
        "attachment; filename=\"relatorio.md\"; filename*=UTF-8''relat%C3%B3rio%20de%20outubro.md",
      ),
    ).toBe("relatorio de outubro.md")
  })

  it("filename* malformado cai para o filename", () => {
    expect(filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A; filename=\"ok.zip\"")).toBe("ok.zip")
  })

  it("aspas escapadas e pastas no nome", () => {
    expect(filenameFromDisposition('attachment; filename="a \\"b\\".csv"')).toBe('a "b".csv')
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"')).toBe("passwd")
  })

  it("sem nome: null", () => {
    expect(filenameFromDisposition(null)).toBeNull()
    expect(filenameFromDisposition("attachment")).toBeNull()
    expect(filenameFromDisposition('attachment; filename=""')).toBeNull()
  })
})

describe("fallbackFilename", () => {
  it("usa a extensão das opções, sem ponto repetido", () => {
    expect(fallbackFilename({ id: "xlsx", extension: "xlsx" })).toBe("meu-caixa.xlsx")
    expect(fallbackFilename({ id: "md", extension: ".md" })).toBe("meu-caixa.md")
  })

  it("sem extensão nas opções: a do contrato (CSV vem num .zip)", () => {
    expect(fallbackFilename({ id: "csv" })).toBe("meu-caixa.zip")
    expect(fallbackFilename({ id: "pdf", extension: "" })).toBe("meu-caixa.pdf")
  })
})

describe("mensagens de erro", () => {
  it("lê o message da API (texto ou lista)", async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 400 })
    expect(await errorMessageFrom(json({ message: "Período inválido." }))).toBe("Período inválido.")
    expect(await errorMessageFrom(json({ message: ["from inválido", "to inválido"] }))).toBe(
      "from inválido; to inválido",
    )
    expect(await errorMessageFrom(new Response("<html>", { status: 502 }))).toBeNull()
  })

  it("texto do aviso por status", () => {
    expect(exportErrorMessage(400, "Escolha ao menos uma seção.")).toBe("Escolha ao menos uma seção.")
    expect(exportErrorMessage(0, null)).toMatch(/Sem resposta do servidor/)
    expect(exportErrorMessage(403, "Forbidden")).toMatch(/permissão/)
    expect(exportErrorMessage(500, null)).toMatch(/erro 500/)
    expect(exportErrorMessage(500, "Internal server error")).toMatch(/A API não conseguiu gerar o arquivo \(erro 500\)/)
    expect(exportErrorMessage(503, "O gerador de PDF está fora.")).toBe("O gerador de PDF está fora.")
    expect(exportErrorMessage(404, null)).toBe("A API recusou o pedido (erro 404).")
  })
})
