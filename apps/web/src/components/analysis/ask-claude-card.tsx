"use client"

import { ArrowUp, MessageCircleQuestion, RotateCcw } from "lucide-react"
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { apiRequest, ClientApiError } from "@/lib/api/client"
import { ASK_LIMITS, type AskAnswer } from "@/lib/api/analysis"
import { cn } from "@/lib/utils"
import { AnswerMarkdown } from "./answer-markdown"
import { askErrorMessage, askHistory, checkQuestion, showCounter, type Exchange } from "./ask"
import { unavailableHint, type AppAvailability } from "./generation"
import { modelLabel } from "./model"

/**
 * "Pergunte ao Claude": uma conversa curta sobre os dados, respondida pela API da Anthropic com as
 * mesmas ferramentas do MCP. A conversa fica só no browser (some ao recarregar); as últimas trocas
 * vão como histórico em cada pergunta.
 */
export function AskClaudeCard({ availability, className }: { availability: AppAvailability; className?: string }) {
  const hint = unavailableHint(availability)
  const id = useId()
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [draft, setDraft] = useState("")
  /** Pergunta no ar (a API leva alguns segundos: o Claude consulta as ferramentas). */
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Texto curto para leitores de tela: "Consultando…", "Resposta pronta.". */
  const [announcement, setAnnouncement] = useState("")
  const nextId = useRef(0)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const lastAnswer = useRef<HTMLElement>(null)
  const focusAnswer = useRef(false)

  // Resposta nova: o foco vai para ela (o leitor de tela lê a partir dali; Tab volta ao campo).
  useEffect(() => {
    if (!focusAnswer.current || !lastAnswer.current) return
    focusAnswer.current = false
    lastAnswer.current.focus({ preventScroll: true })
    lastAnswer.current.scrollIntoView({ block: "nearest" })
  }, [exchanges])

  const disabled = hint !== null
  const counter = showCounter(draft.length)
  const tooLong = draft.trim().length > ASK_LIMITS.question

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (disabled || pending !== null) return
    const check = checkQuestion(draft)
    if (!check.ok) {
      setError(check.message)
      textarea.current?.focus()
      return
    }
    const question = check.question
    setPending(question)
    setError(null)
    setDraft("")
    setAnnouncement("Consultando seus dados…")
    try {
      const response = await apiRequest<AskAnswer>("/api/analysis/ask", {
        method: "POST",
        body: { question, history: askHistory(exchanges) },
      })
      focusAnswer.current = true
      setExchanges((current) => [
        ...current,
        { id: `troca-${nextId.current++}`, question, answer: response.answer, model: response.model },
      ])
      setAnnouncement("Resposta do Claude pronta.")
    } catch (failure) {
      if (failure instanceof ClientApiError && failure.status === 401) return
      // A pergunta volta para o campo, para tentar de novo sem redigitar.
      setDraft((current) => current || question)
      setError(askErrorMessage(failure))
      setAnnouncement("")
      textarea.current?.focus()
    } finally {
      setPending(null)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra a linha (e Enter durante a composição de acentos não envia).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  function restart() {
    setExchanges([])
    setError(null)
    setAnnouncement("Conversa apagada.")
    textarea.current?.focus()
  }

  const titleId = `${id}-titulo`
  const noteId = `${id}-nota`
  const errorId = `${id}-erro`
  const counterId = `${id}-contador`

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
            <MessageCircleQuestion className="text-muted-foreground size-4" aria-hidden />
          </span>
          <div className="space-y-1">
            <CardTitle>
              <h2 id={titleId} className="leading-tight">
                Pergunte ao Claude
              </h2>
            </CardTitle>
            <CardDescription className="text-pretty">
              Tire dúvidas sobre o seu dinheiro em linguagem natural: o Claude consulta as suas transações para
              responder.
            </CardDescription>
          </div>
        </div>
        {exchanges.length > 0 && (
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground -my-1"
              onClick={restart}
              disabled={pending !== null}
            >
              <RotateCcw aria-hidden />
              <span className="max-sm:sr-only">Nova conversa</span>
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {(exchanges.length > 0 || pending !== null) && (
          <ol aria-label="Conversa com o Claude" className="space-y-4">
            {exchanges.map((exchange, index) => (
              <li key={exchange.id} className="space-y-3">
                <Question text={exchange.question} />
                <article
                  ref={index === exchanges.length - 1 ? lastAnswer : undefined}
                  tabIndex={-1}
                  aria-label={`Resposta do Claude: ${clipLabel(exchange.question)}`}
                  className="focus-visible:ring-ring/50 -mx-2 scroll-mt-20 rounded-md px-2 py-1 outline-none focus-visible:ring-[3px]"
                >
                  <p className="text-muted-foreground mb-1.5 text-xs">{modelLabel(exchange.model)}</p>
                  <AnswerMarkdown>{exchange.answer}</AnswerMarkdown>
                </article>
              </li>
            ))}
            {pending !== null && (
              <li className="space-y-3">
                <Question text={pending} />
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Spinner role="presentation" aria-label={undefined} aria-hidden />
                  Consultando seus dados…
                </p>
              </li>
            )}
          </ol>
        )}

        <form aria-labelledby={titleId} onSubmit={submit} className="mt-auto space-y-2">
          <InputGroup data-disabled={disabled || undefined}>
            <InputGroupTextarea
              ref={textarea}
              rows={2}
              value={draft}
              disabled={disabled}
              onChange={(event) => {
                setDraft(event.target.value)
                if (error) setError(null)
              }}
              onKeyDown={onKeyDown}
              aria-label="Sua pergunta"
              aria-describedby={cn(noteId, error && errorId, counter && counterId)}
              aria-invalid={tooLong || undefined}
              placeholder={
                exchanges.length > 0
                  ? "Continue a conversa…"
                  : "Ex.: quanto gastei com delivery nos últimos 3 meses?"
              }
              className="max-h-48 min-h-16"
            />
            <InputGroupAddon align="block-end" className="justify-between gap-3">
              <span
                id={counterId}
                className={cn(
                  "text-xs tabular-nums",
                  tooLong ? "text-destructive" : "text-muted-foreground",
                  !counter && "invisible",
                )}
              >
                {draft.trim().length}/{ASK_LIMITS.question}
              </span>
              <InputGroupButton
                type="submit"
                variant="default"
                size="sm"
                disabled={disabled}
                aria-disabled={pending !== null || undefined}
                className="aria-disabled:cursor-progress aria-disabled:opacity-50"
              >
                {pending !== null ? "Consultando…" : "Perguntar"}
                {pending !== null ? (
                  <Spinner role="presentation" aria-label={undefined} aria-hidden />
                ) : (
                  <ArrowUp aria-hidden />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {error && (
            <p id={errorId} role="alert" className="text-destructive text-sm text-pretty">
              {error}
            </p>
          )}
        </form>
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </CardContent>

      <CardFooter className="border-t [.border-t]:pt-4">
        <p id={noteId} className="text-muted-foreground text-xs leading-5 text-pretty">
          {hint ?? (
            <>
              Usa a API da Anthropic, cobrada por uso
              {availability.kind === "ready" && availability.model ? ` (${modelLabel(availability.model)})` : ""}. A
              conversa não fica salva. Enter envia; Shift+Enter quebra a linha.
            </>
          )}
        </p>
      </CardFooter>
    </Card>
  )
}

function Question({ text }: { text: string }) {
  return (
    <p className="bg-muted ml-auto w-fit max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words">
      <span className="sr-only">Você perguntou: </span>
      {text}
    </p>
  )
}

function clipLabel(text: string): string {
  return text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text
}
