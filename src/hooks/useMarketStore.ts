/**
 * Estado central de tu mercado de predicciones personal.
 *
 * Reúne mercados, posiciones, movimientos y saldo de práctica, los persiste en
 * localStorage y expone las acciones del ciclo completo:
 *
 *   crear mercado -> apostar -> (vender) -> resolver -> cobrar
 *
 * La contabilidad es local y de práctica. No hay dinero real involucrado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MarketCategory,
  OutcomeType,
  PredictionMarket,
  UserPosition,
  Web3Transaction,
} from '../types'
import {
  createEmptyState,
  loadState,
  parseImportedState,
  saveState,
  type PersistedState,
} from '../store/persistence'
import { INITIAL_MARKETS } from '../data/mockMarkets'

/** Saldo de práctica con el que arrancas la primera vez. */
export const STARTING_BANKROLL_USD = 10_000

/** Límites de probabilidad, para que el precio nunca sea 0 o 1 exactos. */
const MIN_PROBABILITY = 2
const MAX_PROBABILITY = 98

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Modelo de impacto de precio.
 *
 * Simplificación honesta de un AMM: cuanto mayor la orden respecto a la
 * liquidez del mercado, más se mueve la probabilidad. No replica LMSR ni el
 * libro de órdenes de Polymarket.
 */
function applyPriceImpact(
  market: PredictionMarket,
  outcome: OutcomeType,
  amountUsd: number,
): PredictionMarket {
  const liquidity = Math.max(market.totalLiquidityUsd, 1)
  const pressure = amountUsd / (liquidity + amountUsd)
  const shiftPoints = pressure * 100 * (outcome === 'YES' ? 1 : -1)

  const nextYes = Math.min(
    Math.max(market.yesProbability + shiftPoints, MIN_PROBABILITY),
    MAX_PROBABILITY,
  )
  const roundedYes = Math.round(nextYes * 10) / 10
  const roundedNo = Math.round((100 - roundedYes) * 10) / 10

  return {
    ...market,
    yesProbability: roundedYes,
    noProbability: roundedNo,
    yesPriceUsd: roundedYes / 100,
    noPriceUsd: roundedNo / 100,
    volume24hUsd: market.volume24hUsd + amountUsd,
    totalLiquidityUsd: market.totalLiquidityUsd + amountUsd * 0.5,
    sparkline: [...market.sparkline.slice(-11), roundedYes],
  }
}

/** Recalcula valor actual y P&L de una posición contra el precio vigente. */
function revaluePosition(
  position: UserPosition,
  markets: PredictionMarket[],
): UserPosition {
  const market = markets.find((m) => m.id === position.marketId)
  if (!market) return position

  const currentPriceUsd =
    position.outcome === 'YES' ? market.yesPriceUsd : market.noPriceUsd
  const currentValueUsd = position.sharesCount * currentPriceUsd
  const pnlUsd = currentValueUsd - position.totalCostUsd
  const pnlPercentage =
    position.totalCostUsd > 0 ? (pnlUsd / position.totalCostUsd) * 100 : 0

  return { ...position, currentPriceUsd, currentValueUsd, pnlUsd, pnlPercentage }
}

function revalueAll(state: PersistedState): PersistedState {
  return {
    ...state,
    positions: state.positions.map((p) => revaluePosition(p, state.markets)),
  }
}

export interface BuySharesInput {
  marketId: string
  outcome: OutcomeType
  amountUsd: number
}

export type BuySharesResult =
  | { ok: true; shares: number }
  | { ok: false; error: string }

export function useMarketStore() {
  const [state, setState] = useState<PersistedState>(() => {
    const saved = loadState()
    if (saved) return revalueAll(saved)
    return createEmptyState(INITIAL_MARKETS, STARTING_BANKROLL_USD)
  })

  // Marca si el estado vino de disco, para distinguir "primera vez" en la UI.
  const isFirstRunRef = useRef<boolean | null>(null)
  if (isFirstRunRef.current === null) {
    isFirstRunRef.current = loadState() === null
  }

  // Persiste en cada cambio, diferido un tick para no bloquear el render.
  useEffect(() => {
    const id = window.setTimeout(() => saveState(state), 0)
    return () => window.clearTimeout(id)
  }, [state])

  /**
   * Compra shares de un resultado. Debita el saldo y mueve el precio.
   *
   * Calcula el siguiente estado a partir del snapshot actual y solo entonces
   * llama a setState, en lugar de derivar el resultado dentro del updater.
   * Un updater debe ser puro: React no garantiza cuándo lo ejecuta y en
   * StrictMode lo invoca dos veces, así que un valor de retorno escrito desde
   * dentro llegaba obsoleto.
   */
  const buyShares = useCallback(
    ({ marketId, outcome, amountUsd }: BuySharesInput): BuySharesResult => {
      if (!(amountUsd > 0)) {
        return { ok: false, error: 'El monto debe ser mayor que cero.' }
      }

      const market = state.markets.find((m) => m.id === marketId)
      if (!market) {
        return { ok: false, error: 'Mercado no encontrado.' }
      }
      if (market.status !== 'active') {
        return { ok: false, error: 'Este mercado ya no acepta órdenes.' }
      }
      if (amountUsd > state.bankrollUsd) {
        return { ok: false, error: 'Saldo de práctica insuficiente.' }
      }

      const pricePerShare =
        outcome === 'YES' ? market.yesPriceUsd : market.noPriceUsd
      if (!(pricePerShare > 0)) {
        return { ok: false, error: 'Precio inválido para este resultado.' }
      }

      const shares = amountUsd / pricePerShare
      const markets = state.markets.map((m) =>
        m.id === marketId ? applyPriceImpact(m, outcome, amountUsd) : m,
      )

      // Fusiona con una posición existente del mismo mercado y resultado.
      const existingIndex = state.positions.findIndex(
        (p) => p.marketId === marketId && p.outcome === outcome,
      )

      let positions: UserPosition[]
      if (existingIndex >= 0) {
        const existing = state.positions[existingIndex]
        positions = [...state.positions]
        positions[existingIndex] = {
          ...existing,
          sharesCount: existing.sharesCount + shares,
          totalCostUsd: existing.totalCostUsd + amountUsd,
          avgPricePaidUsd:
            (existing.totalCostUsd + amountUsd) /
            (existing.sharesCount + shares),
        }
      } else {
        positions = [
          {
            id: newId('pos'),
            marketId: market.id,
            marketTitle: market.title,
            category: market.category,
            outcome,
            sharesCount: shares,
            avgPricePaidUsd: pricePerShare,
            totalCostUsd: amountUsd,
            currentPriceUsd: pricePerShare,
            currentValueUsd: shares * pricePerShare,
            pnlUsd: 0,
            pnlPercentage: 0,
            timestamp: nowIso(),
          },
          ...state.positions,
        ]
      }

      const tx: Web3Transaction = {
        id: newId('tx'),
        type: 'BUY',
        marketTitle: market.title,
        outcome,
        shares,
        amountUsd,
        txHash: '',
        timestamp: nowIso(),
        status: 'confirmed',
        blockNumber: 0,
        gasFeeUsd: 0,
      }

      setState(
        revalueAll({
          ...state,
          markets,
          positions,
          bankrollUsd: state.bankrollUsd - amountUsd,
          transactions: [tx, ...state.transactions],
        }),
      )

      return { ok: true, shares }
    },
    [state],
  )

  /** Vende una posición completa al precio vigente. */
  const sellPosition = useCallback((positionId: string) => {
    setState((prev) => {
      const position = prev.positions.find((p) => p.id === positionId)
      if (!position) return prev

      const market = prev.markets.find((m) => m.id === position.marketId)
      const price = market
        ? position.outcome === 'YES'
          ? market.yesPriceUsd
          : market.noPriceUsd
        : position.currentPriceUsd
      const proceeds = position.sharesCount * price

      // Vender empuja el precio en dirección contraria a la compra.
      const markets = market
        ? prev.markets.map((m) =>
            m.id === market.id
              ? applyPriceImpact(
                  m,
                  position.outcome === 'YES' ? 'NO' : 'YES',
                  proceeds,
                )
              : m,
          )
        : prev.markets

      const tx: Web3Transaction = {
        id: newId('tx'),
        type: 'SELL',
        marketTitle: position.marketTitle,
        outcome: position.outcome,
        shares: position.sharesCount,
        amountUsd: proceeds,
        txHash: '',
        timestamp: nowIso(),
        status: 'confirmed',
        blockNumber: 0,
        gasFeeUsd: 0,
      }

      return revalueAll({
        ...prev,
        markets,
        positions: prev.positions.filter((p) => p.id !== positionId),
        bankrollUsd: prev.bankrollUsd + proceeds,
        transactions: [tx, ...prev.transactions],
      })
    })
  }, [])

  /**
   * Resuelve un mercado. Esta es la pieza que hace que el mercado sea tuyo:
   * tú declaras el resultado, cada share ganadora paga $1 y las perdedoras $0.
   */
  const resolveMarket = useCallback(
    (marketId: string, winningOutcome: OutcomeType) => {
      setState((prev) => {
        const market = prev.markets.find((m) => m.id === marketId)
        if (!market || market.status === 'resolved') return prev

        const affected = prev.positions.filter((p) => p.marketId === marketId)
        const payout = affected
          .filter((p) => p.outcome === winningOutcome)
          .reduce((acc, p) => acc + p.sharesCount, 0)

        const claimTxs: Web3Transaction[] = affected.map((p) => ({
          id: newId('tx'),
          type: 'CLAIM_REWARD',
          marketTitle: p.marketTitle,
          outcome: p.outcome,
          shares: p.sharesCount,
          amountUsd: p.outcome === winningOutcome ? p.sharesCount : 0,
          txHash: '',
          timestamp: nowIso(),
          status: 'confirmed',
          blockNumber: 0,
          gasFeeUsd: 0,
        }))

        const finalProb = winningOutcome === 'YES' ? 100 : 0

        const markets = prev.markets.map((m) =>
          m.id === marketId
            ? {
                ...m,
                status: 'resolved' as const,
                resolvedOutcome: winningOutcome,
                yesProbability: finalProb,
                noProbability: 100 - finalProb,
                yesPriceUsd: finalProb / 100,
                noPriceUsd: (100 - finalProb) / 100,
                sparkline: [...m.sparkline.slice(-11), finalProb],
              }
            : m,
        )

        return {
          ...prev,
          markets,
          // Las posiciones del mercado resuelto se cierran al cobrar.
          positions: prev.positions.filter((p) => p.marketId !== marketId),
          bankrollUsd: prev.bankrollUsd + payout,
          transactions: [...claimTxs, ...prev.transactions],
        }
      })
    },
    [],
  )

  /** Añade un mercado creado por ti. */
  const createMarket = useCallback((market: PredictionMarket) => {
    setState((prev) => ({ ...prev, markets: [market, ...prev.markets] }))
  }, [])

  /** Borra un mercado, devolviendo el costo de sus posiciones abiertas. */
  const deleteMarket = useCallback((marketId: string) => {
    setState((prev) => {
      const refund = prev.positions
        .filter((p) => p.marketId === marketId)
        .reduce((acc, p) => acc + p.totalCostUsd, 0)

      return revalueAll({
        ...prev,
        markets: prev.markets.filter((m) => m.id !== marketId),
        positions: prev.positions.filter((p) => p.marketId !== marketId),
        bankrollUsd: prev.bankrollUsd + refund,
      })
    })
  }, [])

  /** Recarga saldo de práctica. */
  const addPracticeFunds = useCallback((amountUsd: number) => {
    if (!(amountUsd > 0)) return
    setState((prev) => ({
      ...prev,
      bankrollUsd: prev.bankrollUsd + amountUsd,
      transactions: [
        {
          id: newId('tx'),
          type: 'FAUCET',
          marketTitle: 'Recarga de saldo de práctica',
          amountUsd,
          txHash: '',
          timestamp: nowIso(),
          status: 'confirmed',
          blockNumber: 0,
          gasFeeUsd: 0,
        },
        ...prev.transactions,
      ],
    }))
  }, [])

  /** Valida el código de un mercado privado y lo recuerda si es correcto. */
  const unlockMarket = useCallback(
    (marketId: string, code: string): boolean => {
      const market = state.markets.find((m) => m.id === marketId)
      if (!market?.privateAccessCode) return false
      if (market.privateAccessCode.trim() !== code.trim()) return false

      setState((prev) =>
        prev.unlockedMarketIds.includes(marketId)
          ? prev
          : { ...prev, unlockedMarketIds: [...prev.unlockedMarketIds, marketId] },
      )
      return true
    },
    [state.markets],
  )

  const isMarketUnlocked = useCallback(
    (market: PredictionMarket) => {
      if (!market.isPrivate) return true
      // Un mercado privado sin código no se podría abrir nunca: se trata como
      // accesible en lugar de dejarlo inaccesible para siempre.
      if (!market.privateAccessCode) return true
      return state.unlockedMarketIds.includes(market.id)
    },
    [state.unlockedMarketIds],
  )

  /** Vuelve al estado inicial, con los mercados de ejemplo. */
  const resetAll = useCallback(() => {
    setState(createEmptyState(INITIAL_MARKETS, STARTING_BANKROLL_USD))
  }, [])

  /** Empieza de cero, sin ningún mercado de ejemplo. */
  const startEmpty = useCallback(() => {
    setState(createEmptyState([], STARTING_BANKROLL_USD))
  }, [])

  const importState = useCallback((json: string) => {
    setState(revalueAll(parseImportedState(json)))
  }, [])

  // Totales derivados
  const totals = useMemo(() => {
    const positionsValue = state.positions.reduce(
      (acc, p) => acc + p.currentValueUsd,
      0,
    )
    const positionsCost = state.positions.reduce(
      (acc, p) => acc + p.totalCostUsd,
      0,
    )

    return {
      positionsValue,
      positionsCost,
      totalPnlUsd: positionsValue - positionsCost,
      netWorthUsd: state.bankrollUsd + positionsValue,
      volume24hUsd: state.markets.reduce((acc, m) => acc + m.volume24hUsd, 0),
      liquidityUsd: state.markets.reduce(
        (acc, m) => acc + m.totalLiquidityUsd,
        0,
      ),
      activeMarketsCount: state.markets.filter((m) => m.status === 'active')
        .length,
    }
  }, [state.markets, state.positions, state.bankrollUsd])

  const categoryCounts = useMemo(() => {
    const counts = {
      All: state.markets.length,
      Crypto: 0,
      Macro: 0,
      'AI & Tech': 0,
      Geopolitics: 0,
      Sports: 0,
      Private: 0,
    } as Record<MarketCategory, number>

    for (const m of state.markets) {
      if (counts[m.category] !== undefined) counts[m.category] += 1
    }
    return counts
  }, [state.markets])

  return {
    markets: state.markets,
    positions: state.positions,
    transactions: state.transactions,
    bankrollUsd: state.bankrollUsd,
    isFirstRun: isFirstRunRef.current ?? false,
    totals,
    categoryCounts,
    rawState: state,
    // acciones
    buyShares,
    sellPosition,
    resolveMarket,
    createMarket,
    deleteMarket,
    addPracticeFunds,
    unlockMarket,
    isMarketUnlocked,
    resetAll,
    startEmpty,
    importState,
  }
}
