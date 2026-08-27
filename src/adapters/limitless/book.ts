/**
 * Matemática del order book de Limitless. Funciones puras con enteros:
 * precios en milésimas (0.001 = 1) y cantidades en unidades crudas del
 * colateral/acciones (6 decimales). Nada de coma flotante en dinero.
 *
 * Convenciones del venue:
 *  - El libro se publica en términos del token YES (`tokenId` = YES).
 *  - Comprar NO equivale a casar contra las pujas (bids) de YES: el precio de
 *    una acción NO es `1 - precioBidYes`. El propio exchange casa órdenes
 *    complementarias acuñando pares YES+NO, por eso el tamaño se conserva.
 *  - Una orden solo admite precio 0.01..0.99 con 3 decimales: los niveles
 *    fuera de ese rango existen en el libro (son el reflejo del lado
 *    contrario) pero no son alcanzables por nuestra orden.
 */
import type { RawOrderbook } from './validate.ts'

/** Precio máximo/mínimo que acepta una orden, en milésimas. */
const MAX_ORDER_PRICE_MILLI = 990
const MIN_ORDER_PRICE_MILLI = 10
/** `makerAmount` mínimo que acepta la API, en unidades crudas. */
const MIN_MAKER_AMOUNT_RAW = 100n

export interface BookLevel {
  /** Precio en milésimas (37 = $0.037 por acción). */
  priceMilli: number
  /** Acciones disponibles, en unidades crudas (1e6 = 1 acción). */
  sizeRaw: bigint
}

/** Convierte un precio decimal del libro a milésimas, o `null` si no encaja. */
export function toPriceMilli(price: number): number | null {
  if (!Number.isFinite(price)) return null
  const milli = Math.round(price * 1000)
  // Tolerancia por representación binaria (0.037 * 1000 = 37.000000000000004).
  if (Math.abs(price * 1000 - milli) > 1e-6) return null
  if (milli < 1 || milli > 999) return null
  return milli
}

/**
 * Niveles ejecutables para COMPRAR un lado, ordenados de mejor a peor precio.
 *
 * YES: los asks del libro. NO: los bids reflejados (`1 - precio`).
 * Se excluyen los niveles con precio fuera del rango que una orden puede
 * declarar (> 0.99), porque nuestra orden nunca podría casarlos.
 */
export function buyLevels(book: RawOrderbook, outcome: 'yes' | 'no'): BookLevel[] {
  const source = outcome === 'yes' ? book.asks : book.bids
  const levels: BookLevel[] = []
  for (const raw of source) {
    const sourceMilli = toPriceMilli(raw.price)
    if (sourceMilli === null) continue
    const priceMilli = outcome === 'yes' ? sourceMilli : 1000 - sourceMilli
    if (priceMilli > MAX_ORDER_PRICE_MILLI) continue
    if (!Number.isSafeInteger(raw.size) || raw.size <= 0) continue
    levels.push({ priceMilli, sizeRaw: BigInt(raw.size) })
  }
  levels.sort((a, b) => a.priceMilli - b.priceMilli)
  return levels
}

export interface BuyWalk {
  /** Acciones compradas, en unidades crudas. */
  sharesRaw: bigint
  /** Colateral gastado, en unidades crudas. */
  spentRaw: bigint
  bestPriceMilli: number
  worstPriceMilli: number
}

/**
 * Recorre el libro comprando con `stakeRaw` de colateral.
 *
 * Devuelve `null` si no hay ni un nivel alcanzable o si el libro se agota
 * antes de gastar el importe (liquidez insuficiente: mejor rechazar que
 * ejecutar a medias sin avisar).
 */
export function walkBuy(levels: BookLevel[], stakeRaw: bigint): BuyWalk | null {
  if (stakeRaw <= 0n || levels.length === 0) return null

  let remaining = stakeRaw
  let sharesRaw = 0n
  let worstPriceMilli = levels[0].priceMilli
  let filled = false

  for (const level of levels) {
    const price = BigInt(level.priceMilli)
    const levelCost = (level.sizeRaw * price) / 1000n
    // Un nivel tan diminuto que cuesta 0 unidades crudas no aporta nada y
    // regalaría acciones a la estimación: fuera.
    if (levelCost === 0n) continue
    if (levelCost <= remaining) {
      sharesRaw += level.sizeRaw
      remaining -= levelCost
      worstPriceMilli = level.priceMilli
      if (remaining === 0n) {
        filled = true
        break
      }
      continue
    }
    // Consumo parcial del nivel: el redondeo a la baja deja como mucho una
    // milésima de céntimo sin gastar, que se ignora.
    const partialShares = (remaining * 1000n) / price
    if (partialShares > 0n) {
      sharesRaw += partialShares
      remaining -= (partialShares * price) / 1000n
      worstPriceMilli = level.priceMilli
    }
    filled = true
    break
  }

  if (!filled || sharesRaw === 0n) return null
  return {
    sharesRaw,
    spentRaw: stakeRaw - remaining,
    bestPriceMilli: levels[0].priceMilli,
    worstPriceMilli,
  }
}

/** Impacto en precio 0..1: cuánto empeora el precio medio frente al mejor. */
export function priceImpactOf(walk: BuyWalk): number {
  const avgMilli =
    Number((walk.spentRaw * 1000n) / walk.sharesRaw) +
    Number((walk.spentRaw * 1000n) % walk.sharesRaw) / Number(walk.sharesRaw)
  const impact = (avgMilli - walk.bestPriceMilli) / walk.bestPriceMilli
  return Math.min(1, Math.max(0, impact))
}

/**
 * Precio límite de la orden: el peor nivel consumido más el slippage
 * tolerado, acotado al rango que la API admite (0.01..0.99).
 */
export function limitPriceMilli(
  worstPriceMilli: number,
  slippageTolerance: number,
): number {
  const raw = Math.ceil(worstPriceMilli * (1 + slippageTolerance))
  return Math.min(
    MAX_ORDER_PRICE_MILLI,
    Math.max(raw, worstPriceMilli, MIN_ORDER_PRICE_MILLI),
  )
}

function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = a % b
    a = b
    b = t
  }
  return a
}

export interface FakBuyAmounts {
  /** Colateral máximo a gastar (tope duro de la FAK), unidades crudas. */
  makerAmountRaw: bigint
  /** Acciones mínimas implícitas al precio firmado, unidades crudas. */
  takerAmountRaw: bigint
}

/**
 * Dimensiona una orden FAK de compra: la API exige que
 * `price × takerAmount == makerAmount` sea EXACTO en unidades crudas, sin
 * redondeo. Se elige el mayor número de acciones cuyo coste al precio límite
 * es entero y no supera el importe apostado.
 *
 * Devuelve `null` si el importe es tan pequeño que no alcanza el mínimo de
 * la API (`makerAmount >= 100` unidades crudas).
 */
export function sizeFakBuy(
  stakeRaw: bigint,
  priceMilli: number,
): FakBuyAmounts | null {
  if (stakeRaw <= 0n || priceMilli < 1 || priceMilli > 999) return null
  const step = BigInt(1000 / gcd(priceMilli, 1000))
  const maxShares = (stakeRaw * 1000n) / BigInt(priceMilli)
  const takerAmountRaw = maxShares - (maxShares % step)
  if (takerAmountRaw <= 0n) return null
  const makerAmountRaw = (takerAmountRaw * BigInt(priceMilli)) / 1000n
  if (makerAmountRaw < MIN_MAKER_AMOUNT_RAW) return null
  return { makerAmountRaw, takerAmountRaw }
}
