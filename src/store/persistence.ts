/**
 * Capa de persistencia local.
 *
 * Todo tu mercado personal (mercados, posiciones, movimientos y saldo) vive en
 * localStorage bajo una sola clave versionada. Es lo que hace que la app sea
 * "real": lo que creas sigue ahí cuando cierras el navegador.
 */

import type {
  PredictionMarket,
  UserPosition,
  Web3Transaction,
} from '../types'

const STORAGE_KEY = 'aether-markets/v1'

export interface PersistedState {
  version: 1
  markets: PredictionMarket[]
  positions: UserPosition[]
  transactions: Web3Transaction[]
  /** Saldo de práctica en USD. No es dinero real. */
  bankrollUsd: number
  /** Códigos de acceso ya validados en este navegador. */
  unlockedMarketIds: string[]
}

export function createEmptyState(
  seedMarkets: PredictionMarket[],
  startingBankrollUsd: number,
): PersistedState {
  return {
    version: 1,
    markets: seedMarkets,
    positions: [],
    transactions: [],
    bankrollUsd: startingBankrollUsd,
    unlockedMarketIds: [],
  }
}

/**
 * Lee el estado guardado. Devuelve null si no hay nada, si está corrupto o si
 * es de una versión que no entendemos: el llamador decide el fallback.
 */
export function loadState(): PersistedState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as unknown
    if (!isPersistedState(parsed)) {
      console.warn('[persistence] estado guardado inválido, se ignora')
      return null
    }
    return parsed
  } catch (error) {
    console.warn('[persistence] no se pudo leer el estado guardado', error)
    return null
  }
}

export function saveState(state: PersistedState): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    // Cuota llena o modo privado: la app sigue funcionando en memoria.
    console.warn('[persistence] no se pudo guardar el estado', error)
  }
}

export function clearState(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.warn('[persistence] no se pudo borrar el estado', error)
  }
}

/** Exporta el estado como JSON descargable, para respaldo o para migrar. */
export function exportStateJson(state: PersistedState): string {
  return JSON.stringify(state, null, 2)
}

/** Importa un respaldo. Lanza si el JSON no tiene la forma esperada. */
export function parseImportedState(json: string): PersistedState {
  const parsed = JSON.parse(json) as unknown
  if (!isPersistedState(parsed)) {
    throw new Error('El archivo no tiene el formato de un respaldo de Aether.')
  }
  return parsed
}

function isPersistedState(value: unknown): value is PersistedState {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    s.version === 1 &&
    Array.isArray(s.markets) &&
    Array.isArray(s.positions) &&
    Array.isArray(s.transactions) &&
    typeof s.bankrollUsd === 'number' &&
    Array.isArray(s.unlockedMarketIds)
  )
}
