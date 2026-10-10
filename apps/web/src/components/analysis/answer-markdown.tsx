import type { ReactNode } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { safeUrl } from "./ask"

/**
 * Resposta do Claude em markdown. Só elementos de texto: HTML cru é descartado (`skipHtml`),
 * imagens não entram (uma imagem remota carregaria sozinha e poderia vazar dados na URL) e links
 * só com http(s), abrindo em nova aba.
 */

const ALLOWED = [
  "p",
  "strong",
  "em",
  "del",
  "ul",
  "ol",
  "li",
  "a",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  "br",
]

/** Títulos da resposta ficam abaixo do "Pergunte ao Claude" (h2) na hierarquia da página. */
const heading3 = ({ children }: { children?: ReactNode }) => (
  <h3 className="mt-4 mb-1.5 text-sm font-semibold first:mt-0">{children}</h3>
)
const heading4 = ({ children }: { children?: ReactNode }) => (
  <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h4>
)

const components: Components = {
  h1: heading3,
  h2: heading3,
  h3: heading4,
  h4: heading4,
  h5: heading4,
  h6: heading4,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-primary underline underline-offset-2"
      >
        {children}
        <span className="sr-only"> (abre em nova aba)</span>
      </a>
    ) : (
      <span>{children}</span>
    ),
  blockquote: ({ children }) => (
    <blockquote className="text-muted-foreground my-2 border-l-2 pl-3 first:mt-0 last:mb-0">{children}</blockquote>
  ),
  code: ({ children, className }) => (
    <code className={cn("bg-muted rounded px-1 py-0.5 font-mono text-[0.8125rem]", className)}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre
      className={cn(
        "bg-muted my-2 overflow-x-auto rounded-md p-3 text-[0.8125rem] first:mt-0 last:mb-0",
        "[&_code]:bg-transparent [&_code]:p-0",
      )}
    >
      {children}
    </pre>
  ),
  hr: () => <hr className="my-3" />,
  // Tabela larga rola dentro do próprio quadro (e o quadro é alcançável pelo teclado para rolar).
  table: ({ children }) => (
    <div
      role="region"
      aria-label="Tabela da resposta"
      tabIndex={0}
      className="focus-visible:ring-ring/50 my-2 overflow-x-auto rounded-md border outline-none focus-visible:ring-[3px] first:mt-0 last:mb-0"
    >
      <table className="w-full text-left text-[0.8125rem] tabular-nums">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th style={style} className="bg-muted/50 border-b px-2.5 py-1.5 font-medium whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border-b px-2.5 py-1.5 align-top [tr:last-child_&]:border-b-0">
      {children}
    </td>
  ),
}

export function AnswerMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-sm leading-relaxed text-pretty break-words", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        allowedElements={ALLOWED}
        unwrapDisallowed
        skipHtml
        urlTransform={(url) => safeUrl(url)}
        components={components}
      >
        {children}
      </Markdown>
    </div>
  )
}
