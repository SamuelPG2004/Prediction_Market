/**
 * Boleto de apuestas: selecciones acumuladas para apostar en tanda.
 *
 * El store solo contiene estado de UI y tipos del dominio. Cotizar y apostar
 * sigue siendo responsabilidad del boleto y requiere confirmación explícita.
 */
import { create } from 'zustand'
import type { Market } from '../domain/types'

export interface BetSlipSelection {
  market: Market
  outcomeId: string
  /** Título del evento, desnormalizado para pintar el boleto sin más datos. */
  eventTitle: string
}

/** Tope de selecciones: cada una exige su propia firma al apostar. */
export const BET_SLIP_LIMIT = 10

interface BetSlipState {
  selections: BetSlipSelection[]
  isOpen: boolean
  toggleSelection: (
    eventTitle: string,
    market: Market,
    outcomeId: string,
  ) => void
  removeSelection: (marketId: string) => void
  clearSelections: () => void
  setOpen: (isOpen: boolean) => void
}

/** Store global: cuotas, boleto flotante y panel comparten la misma selección. */
export const useBetSlipStore = create<BetSlipState>()((set, get) => ({
  selections: [],
  isOpen: false,
  toggleSelection: (eventTitle, market, outcomeId) => {
    const { selections } = get()
    const existing = selections.find((selection) => selection.market.id === market.id)

    if (existing?.outcomeId === outcomeId) {
      set({ selections: selections.filter((selection) => selection.market.id !== market.id) })
      return
    }

    const next = selections.filter((selection) => selection.market.id !== market.id)
    if (next.length >= BET_SLIP_LIMIT) return

    set({
      selections: [...next, { market, outcomeId, eventTitle }],
      isOpen: true,
    })
  },
  removeSelection: (marketId) =>
    set((state) => ({
      selections: state.selections.filter((selection) => selection.market.id !== marketId),
    })),
  clearSelections: () => set({ selections: [] }),
  setOpen: (isOpen) => set({ isOpen }),
}))

export function toggleSelection(
  eventTitle: string,
  market: Market,
  outcomeId: string,
): void {
  useBetSlipStore.getState().toggleSelection(eventTitle, market, outcomeId)
}

export function removeSelection(marketId: string): void {
  useBetSlipStore.getState().removeSelection(marketId)
}

export function clearSelections(): void {
  useBetSlipStore.getState().clearSelections()
}

export function useBetSlip(): {
  selections: BetSlipSelection[]
  isOpen: boolean
  setOpen: (isOpen: boolean) => void
  /** ¿Está esta cuota exacta en el boleto? Para marcar el botón en la tarjeta. */
  isSelected: (marketId: string, outcomeId: string) => boolean
} {
  const selections = useBetSlipStore((state) => state.selections)
  const isOpen = useBetSlipStore((state) => state.isOpen)
  const setOpen = useBetSlipStore((state) => state.setOpen)
  return {
    selections,
    isOpen,
    setOpen,
    isSelected: (marketId, outcomeId) =>
      selections.some((selection) => selection.market.id === marketId && selection.outcomeId === outcomeId),
  }
}
