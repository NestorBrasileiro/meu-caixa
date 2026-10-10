import { describe, expect, it } from "vitest"
import { ASK_LIMITS } from "@/lib/api/analysis"
import { askErrorMessage, askHistory, checkQuestion, safeUrl, showCounter, type Exchange } from "./ask"

const exchange = (n: number, answer = `resposta ${n}`): Exchange => ({
  id: `t${n}`,
  question: `pergunta ${n}`,
  answer,
  model: "claude-sonnet-4-5",
})

describe("analysis/ask — histórico", () => {
  it("conversa vazia: sem histórico", () => {
    expect(askHistory([])).toEqual([])
  })

  it("pares pergunta/resposta, alternando e começando pelo usuário", () => {
    expect(askHistory([exchange(1), exchange(2)])).toEqual([
      { role: "user", content: "pergunta 1" },
      { role: "assistant", content: "resposta 1" },
      { role: "user", content: "pergunta 2" },
      { role: "assistant", content: "resposta 2" },
    ])
  })

  it("só as últimas trocas, dentro do limite de mensagens da API", () => {
    const history = askHistory(Array.from({ length: 8 }, (_, i) => exchange(i + 1)))
    expect(history).toHaveLength(ASK_LIMITS.historyTurns)
    expect(history[0]).toEqual({ role: "user", content: "pergunta 4" })
    expect(history.at(-1)).toEqual({ role: "assistant", content: "resposta 8" })
  })

  it("limite ímpar não deixa uma resposta órfã no começo", () => {
    const history = askHistory([exchange(1), exchange(2), exchange(3)], { ...ASK_LIMITS, historyTurns: 5 })
    expect(history.map((turn) => turn.role)).toEqual(["user", "assistant", "user", "assistant"])
    expect(history[0].content).toBe("pergunta 2")
  })

  it("corta mensagens longas no limite da API", () => {
    const long = "a".repeat(ASK_LIMITS.turnContent + 500)
    const [, answer] = askHistory([exchange(1, long)])
    expect(answer.content).toHaveLength(ASK_LIMITS.turnContent)
    expect(answer.content.endsWith("…")).toBe(true)
  })
})

describe("analysis/ask — pergunta", () => {
  it("tira espaços das pontas; vazia não envia nem acusa erro", () => {
    expect(checkQuestion("  quanto gastei?  ")).toEqual({ ok: true, question: "quanto gastei?" })
    expect(checkQuestion("   \n ")).toEqual({ ok: false, message: null })
  })

  it("acima do limite explica, sem cortar a pergunta", () => {
    expect(checkQuestion("a".repeat(ASK_LIMITS.question))).toMatchObject({ ok: true })
    expect(checkQuestion("a".repeat(ASK_LIMITS.question + 1))).toEqual({
      ok: false,
      message: `A pergunta passou do limite de ${ASK_LIMITS.question} caracteres. Encurte um pouco.`,
    })
  })

  it("contador aparece perto do limite", () => {
    expect(showCounter(100)).toBe(false)
    expect(showCounter(ASK_LIMITS.question * 0.8)).toBe(true)
  })
})

describe("analysis/ask — erros", () => {
  const apiError = (status: number, message: string) => Object.assign(new Error(message), { status })

  it("429: a mensagem da API, ou a nossa", () => {
    expect(askErrorMessage(apiError(429, "Outra pergunta ainda está sendo respondida."))).toBe(
      "Outra pergunta ainda está sendo respondida.",
    )
    expect(askErrorMessage(apiError(429, "Erro 429"))).toMatch(/respondendo outra pergunta/)
  })

  it("503 sem mensagem aponta a ANTHROPIC_API_KEY; 5xx e rede têm frase própria", () => {
    expect(askErrorMessage(apiError(503, "Erro 503"))).toMatch(/ANTHROPIC_API_KEY/)
    expect(askErrorMessage(apiError(504, "O Claude demorou demais para responder."))).toBe(
      "O Claude demorou demais para responder.",
    )
    expect(askErrorMessage(apiError(502, "Erro 502"))).toMatch(/não conseguiu responder/)
    expect(askErrorMessage(apiError(500, "Internal server error"))).toMatch(/não conseguiu responder/)
    expect(askErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Sem conexão/)
  })

  it("400: a validação da API", () => {
    expect(askErrorMessage(apiError(400, "question: muito longa"))).toBe("question: muito longa")
    expect(askErrorMessage(apiError(400, "Erro 400"))).toBe("A API recusou a pergunta (erro 400).")
  })
})

describe("analysis/ask — links das respostas", () => {
  it("só http(s)", () => {
    expect(safeUrl("https://www.bcb.gov.br/")).toBe("https://www.bcb.gov.br/")
    expect(safeUrl(" http://exemplo.com/a ")).toBe("http://exemplo.com/a")
    expect(safeUrl("javascript:alert(1)")).toBeNull()
    expect(safeUrl("data:text/html,oi")).toBeNull()
    expect(safeUrl("/api/sync")).toBeNull()
    expect(safeUrl("https://x.com/a b")).toBeNull()
  })
})
