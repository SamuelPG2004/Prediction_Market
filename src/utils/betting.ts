/**
 * Cálculos puros del boleto y de las etiquetas de cuota. Extraídos de los
 * componentes (BetSlip, TradePanel) para poder testearlos sin renderizar:
 * aquí no hay React ni red, solo dominio.
 */
import type { Market } from '../domain/types'

/** Importe válido para apostar: decimal positivo con hasta 6 decimales. */
export function isValidAmount(value: string): boolean {
  return /^\d+(\.\d{1,6})?$/.test(value.trim()) && Number(value) > 0
}

/**
 * Vista previa del producto de cuotas de una combinada con los precios del
 * catálogo. `null` si alguna pata no tiene cuota decimal: la cuota firme la
 * da el venue al cotizar, esto es solo orientativo.
 */
export function previewComboOdds(
  selections: readonly { market: Market; outcomeId: string }[],
): number | null {
  return selections.reduce((acc: number | null, s) => {
    if (acc === null) return null
    const o = s.market.outcomes.find((x) => x.id === s.outcomeId)
    if (
      o === undefined ||
      o.price === null ||
      s.market.priceFormat !== 'decimal-odds'
    ) {
      return null
    }
    return acc * Number(o.price)
  }, 1)
}

export interface ComboCheck {
  available: boolean
  /** Por qué no hay combinada, para decirlo en vez de esconder la pestaña. */
  reason: string | null
}

/**
 * ¿Pueden estas selecciones apostarse como combinada? Las reglas del boleto:
 * al menos dos patas, todas del mismo venue, ese venue sabe combinar, y cada
 * pata de un partido distinto (el protocolo no combina un mismo juego).
 *
 * `venueCaps` son las capacidades del único venue de las selecciones, o
 * `null` si no se pudo resolver.
 */
export function checkComboAvailability(
  selections: readonly { market: Market }[],
  venueCaps: { displayName: string; canCombo: boolean } | null,
): ComboCheck {
  if (selections.length < 2) {
    return { available: false, reason: 'Añade al menos dos selecciones.' }
  }
  const venueIds = new Set(selections.map((s) => s.market.venue))
  if (venueIds.size > 1) {
    return {
      available: false,
      reason:
        'Las selecciones mezclan dos casas distintas; una combinada vive en una sola.',
    }
  }
  if (venueCaps !== null && !venueCaps.canCombo) {
    return {
      available: false,
      reason: `${venueCaps.displayName} no ofrece apuestas combinadas.`,
    }
  }
  const gameIds = selections.map((s) => s.market.group?.id)
  const distinctGames =
    !gameIds.includes(undefined) && new Set(gameIds).size === selections.length
  if (!distinctGames) {
    return {
      available: false,
      reason: 'Hay dos selecciones del mismo partido: no se pueden combinar.',
    }
  }
  if (venueCaps === null) {
    return { available: false, reason: null }
  }
  return { available: true, reason: null }
}

/**
 * Texto de la cuota de un resultado: decimal en venues de cuotas, % en el
 * resto. Sin precio: raya, nunca un 0 inventado.
 */
export function outcomeOddsText(
  market: Market,
  outcome: Market['outcomes'][number] | undefined,
): string {
  if (outcome === undefined) return '—'
  if (market.priceFormat === 'decimal-odds' && outcome.price !== null) {
    return Number(outcome.price).toFixed(2)
  }
  return outcome.probability === null
    ? '—'
    : `${Math.round(outcome.probability * 100)}%`
}

/** Como `outcomeOddsText`, buscando el resultado por su id. */
export function selectionOddsText(market: Market, outcomeId: string): string {
  return outcomeOddsText(
    market,
    market.outcomes.find((o) => o.id === outcomeId),
  )
}
