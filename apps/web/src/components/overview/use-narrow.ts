"use client"

import { useCallback, useState } from "react"

/**
 * Diz se o elemento medido tem menos de `minWidth` px de largura (via
 * ResizeObserver). Vale a largura real do componente, não a da janela: com a
 * barra lateral aberta, um card pode ser estreito mesmo num tablet.
 *
 * Devolve um callback ref (o elemento pode ser desmontado e montado de novo,
 * como o conteúdo de uma aba) e `null` enquanto ainda não mediu.
 */
export function useNarrow<T extends HTMLElement>(minWidth: number) {
  const [narrow, setNarrow] = useState<boolean | null>(null)
  const ref = useCallback(
    (element: T | null) => {
      if (!element) return
      const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < minWidth))
      observer.observe(element)
      return () => observer.disconnect()
    },
    [minWidth],
  )
  return [ref, narrow] as const
}
