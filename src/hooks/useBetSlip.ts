/**
 * Boleto de apuestas: selecciones acumuladas para apostar en tanda.
 *
 * Son apuestas SIMPLES múltiples, no una combinada: el dominio no tiene
 * combos (decisión de la Fase 2), así que cada selección se cotiza y se firma
 * por separado contra su venue. El boleto es estado de UI puro: solo conoce
 * el dominio y no toca la red — cotizar y apostar lo hace quien lo pinta.
 *
 * Store de módulo con suscripción: el mismo boleto vive en las tarjetas (para
 * marcar la cuota elegida), en el botón flotante y en el cajón, sin arrastrar
 * un provider ni una librería de estado.
 */
import { useSyncExternalStore } from 'react'
import type { Market } from '../domain/types'

export interface BetSlipSelection {
  market: Market
  outcomeId: string
  /** Título del evento, desnormalizado para pintar el boleto sin más datos. */
  eventTitle: string
}

/** Tope de selecciones: cada una exige su propia firma al apostar. */
export const BET_SLIP_LIMIT = 10

let selections: readonly BetSlipSelection[] = []
const listeners = new Set<() => void>()

function emit(next: readonly BetSlipSelection[]): void {
  selections = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): readonly BetSlipSelection[] {
  return selections
}

/**
 * Clic en una cuota: la añade al boleto; repetir la misma la quita, y otra
 * cuota del mismo mercado la sustituye (una selección por mercado, como en
 * cualquier casa de apuestas).
 */
export function toggleSelection(
  eventTitle: string,
  market: Market,
  outcomeId: string,
): void {
  const existing = selections.find((s) => s.market.id === market.id)
  if (existing !== undefined && existing.outcomeId === outcomeId) {
    emit(selections.filter((s) => s.market.id !== market.id))
    return
  }
  const next = selections.filter((s) => s.market.id !== market.id)
  if (next.length >= BET_SLIP_LIMIT) return
  emit([...next, { market, outcomeId, eventTitle }])
}

export function removeSelection(marketId: string): void {
  emit(selections.filter((s) => s.market.id !== marketId))
}

export function clearSelections(): void {
  emit([])
}

export function useBetSlip(): {
  selections: readonly BetSlipSelection[]
  /** ¿Está esta cuota exacta en el boleto? Para marcar el botón en la tarjeta. */
  isSelected: (marketId: string, outcomeId: string) => boolean
} {
  const current = useSyncExternalStore(subscribe, getSnapshot)
  return {
    selections: current,
    isSelected: (marketId, outcomeId) =>
      current.some((s) => s.market.id === marketId && s.outcomeId === outcomeId),
  }
}
