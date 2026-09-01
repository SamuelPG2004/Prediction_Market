/**
 * Validación de las respuestas de la API de Limitless.
 *
 * Mismo criterio que en el adaptador de Azuro: estricto con la ESTRUCTURA,
 * tolerante con los ENUMS (un estado desconocido degrada, no rompe). Guards a
 * mano, sin zod. Un elemento inválido se descarta y se cuenta en `dropped`;
 * una estructura de nivel superior inválida devuelve `null` y el adaptador la
 * convierte en `invalid_response`.
 */

// --- Formas crudas ------------------------------------------------------------

export interface RawProperty {
  key: string
  values: string[]
}

export interface RawLimitlessMarket {
  slug: string
  title: string
  proxyTitle: string | null
  status: string
  expired: boolean
  /** Epoch en milisegundos. */
  expirationTimestamp: number | null
  tradeType: string
  /** Ids ERC-1155 de las posiciones YES/NO. Ausente en algunos AMM. */
  tokens: { yes: string; no: string } | null
  /** CLOB: [pYes, pNo] en 0..1. AMM: escala 0..100 (se descarta al mapear). */
  prices: number[]
  venue: { exchange: string | null; adapter: string | null }
  collateralToken: { address: string; symbol: string; decimals: number } | null
  /** Id de condición del CTF (bytes32), necesario para cobrar premios. */
  conditionId: string | null
  properties: RawProperty[]
  winningOutcomeIndex: number | null
  payoutNumerators: number[] | null
  /** `metadata.fee`: el mercado cobra comisión de taker. */
  feeMarket: boolean
  /** `metadata.openPrice`: presente en los mercados Up/Down recurrentes. */
  hasOpenPrice: boolean
  hidden: boolean
  imageUrl: string | null
}

export interface RawLimitlessGroup {
  slug: string
  title: string
  status: string
  expired: boolean
  properties: RawProperty[]
  imageUrl: string | null
  markets: RawLimitlessMarket[]
}

export type RawListingItem =
  | { kind: 'market'; market: RawLimitlessMarket }
  | { kind: 'group'; group: RawLimitlessGroup }

export interface RawListingPage {
  items: RawListingItem[]
  /** Total de mercados del listado, si la API lo informa. */
  totalMarketsCount: number | null
}

export interface RawOrderbookLevel {
  price: number
  size: number
}

export interface RawOrderbook {
  bids: RawOrderbookLevel[]
  asks: RawOrderbookLevel[]
  /** Id de la posición YES del mercado. */
  tokenId: string
}

export interface RawProfile {
  id: number
  account: string
  feeRateBps: number
}

export interface RawPositionSide {
  /** Unidades crudas del colateral, como string de dígitos. */
  costRaw: string
  marketValueRaw: string
  /** Precio medio de compra por acción, en unidades crudas. */
  fillPriceRaw: string
  /** Acciones en unidades crudas, si la API las informa. */
  balanceRaw: string | null
}

export interface RawClobPosition {
  market: {
    slug: string
    title: string | null
    status: string | null
    winningOutcomeIndex: number | null
    payoutNumerators: number[] | null
  }
  yes: RawPositionSide
  no: RawPositionSide
}

export interface RawCreateOrderResponse {
  orderId: string | null
  settlementStatus: string
  matched: boolean
  txHash: string | null
  reason: string | null
}

export interface Parsed<T> {
  value: T
  dropped: number
}

// --- Guards básicos --------------------------------------------------------------

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null
}

function asString(u: unknown): string | null {
  return typeof u === 'string' ? u : null
}

function asFiniteNumber(u: unknown): number | null {
  return typeof u === 'number' && Number.isFinite(u) ? u : null
}

function asBoolean(u: unknown, fallback: boolean): boolean {
  return typeof u === 'boolean' ? u : fallback
}

/** String compuesto solo de dígitos (importes crudos). */
function asDigitString(u: unknown): string | null {
  return typeof u === 'string' && /^\d+$/.test(u) ? u : null
}

function asNumberArray(u: unknown): number[] | null {
  if (!Array.isArray(u)) return null
  const out: number[] = []
  for (const item of u) {
    const n = asFiniteNumber(item)
    if (n === null) return null
    out.push(n)
  }
  return out
}

// --- Mercados -----------------------------------------------------------------------

function parseProperties(u: unknown): RawProperty[] {
  if (!Array.isArray(u)) return []
  const properties: RawProperty[] = []
  for (const raw of u) {
    if (!isRecord(raw)) continue
    const key = asString(raw.propertyKeySlug)
    if (key === null || !Array.isArray(raw.value)) continue
    properties.push({
      key,
      values: raw.value.filter((v): v is string => typeof v === 'string'),
    })
  }
  return properties
}

export function parseMarket(u: unknown): RawLimitlessMarket | null {
  if (!isRecord(u)) return null
  const slug = asString(u.slug)
  const title = asString(u.title)
  const status = asString(u.status)
  const tradeType = asString(u.tradeType)
  if (slug === null || title === null || status === null || tradeType === null) {
    return null
  }
  const prices = asNumberArray(u.prices)
  if (prices === null) return null

  let tokens: RawLimitlessMarket['tokens'] = null
  if (isRecord(u.tokens)) {
    const yes = asString(u.tokens.yes)
    const no = asString(u.tokens.no)
    if (yes !== null && no !== null) tokens = { yes, no }
  }

  const venue = { exchange: null as string | null, adapter: null as string | null }
  if (isRecord(u.venue)) {
    venue.exchange = asString(u.venue.exchange)
    venue.adapter = asString(u.venue.adapter)
  }

  let collateralToken: RawLimitlessMarket['collateralToken'] = null
  if (isRecord(u.collateralToken)) {
    const address = asString(u.collateralToken.address)
    const symbol = asString(u.collateralToken.symbol)
    const decimals = asFiniteNumber(u.collateralToken.decimals)
    if (address !== null && symbol !== null && decimals !== null) {
      collateralToken = { address, symbol, decimals }
    }
  }

  const metadata = isRecord(u.metadata) ? u.metadata : {}

  return {
    slug,
    title,
    proxyTitle: asString(u.proxyTitle),
    status,
    expired: asBoolean(u.expired, false),
    expirationTimestamp: asFiniteNumber(u.expirationTimestamp),
    tradeType,
    tokens,
    prices,
    venue,
    collateralToken,
    conditionId: asString(u.conditionId),
    properties: parseProperties(u.properties),
    winningOutcomeIndex: asFiniteNumber(u.winningOutcomeIndex),
    payoutNumerators: asNumberArray(u.payoutNumerators),
    feeMarket: isRecord(metadata) ? asBoolean(metadata.fee, false) : false,
    hasOpenPrice: isRecord(metadata) && asString(metadata.openPrice) !== null,
    hidden: asBoolean(u.hidden, false),
    imageUrl: asString(u.imageUrl),
  }
}

function parseGroup(u: unknown): RawLimitlessGroup | null {
  if (!isRecord(u) || !Array.isArray(u.markets)) return null
  const slug = asString(u.slug)
  const title = asString(u.title)
  const status = asString(u.status)
  if (slug === null || title === null || status === null) return null

  const markets: RawLimitlessMarket[] = []
  for (const raw of u.markets) {
    const market = parseMarket(raw)
    // Un submercado malformado invalida el grupo entero: a un evento
    // multi-resultado no le puede faltar una pata sin engañar al usuario.
    if (market === null) return null
    markets.push(market)
  }
  if (markets.length === 0) return null

  return {
    slug,
    title,
    status,
    expired: asBoolean(u.expired, false),
    properties: parseProperties(u.properties),
    imageUrl: asString(u.imageUrl),
    markets,
  }
}

function parseListingItem(u: unknown): RawListingItem | null {
  if (!isRecord(u)) return null
  if (u.marketType === 'group' || Array.isArray(u.markets)) {
    const group = parseGroup(u)
    return group === null ? null : { kind: 'group', group }
  }
  const market = parseMarket(u)
  return market === null ? null : { kind: 'market', market }
}

function parseListingItems(items: unknown[]): Parsed<RawListingItem[]> {
  const parsed: RawListingItem[] = []
  let dropped = 0
  for (const raw of items) {
    const item = parseListingItem(raw)
    if (item === null) dropped += 1
    else parsed.push(item)
  }
  return { value: parsed, dropped }
}

/** `GET /markets/active` → `{ data: [...], totalMarketsCount }`. */
export function parseActivePage(u: unknown): Parsed<RawListingPage> | null {
  if (!isRecord(u) || !Array.isArray(u.data)) return null
  const items = parseListingItems(u.data)
  return {
    value: {
      items: items.value,
      totalMarketsCount: asFiniteNumber(u.totalMarketsCount),
    },
    dropped: items.dropped,
  }
}

/** `GET /markets/search` → `{ markets: [...], totalMarketsCount }`. */
export function parseSearchPage(u: unknown): Parsed<RawListingPage> | null {
  if (!isRecord(u) || !Array.isArray(u.markets)) return null
  const items = parseListingItems(u.markets)
  return {
    value: {
      items: items.value,
      totalMarketsCount: asFiniteNumber(u.totalMarketsCount),
    },
    dropped: items.dropped,
  }
}

// --- Orderbook -----------------------------------------------------------------------

function parseLevels(u: unknown): RawOrderbookLevel[] | null {
  if (!Array.isArray(u)) return null
  const levels: RawOrderbookLevel[] = []
  for (const raw of u) {
    if (!isRecord(raw)) return null
    const price = asFiniteNumber(raw.price)
    const size = asFiniteNumber(raw.size)
    if (price === null || size === null) return null
    levels.push({ price, size })
  }
  return levels
}

export function parseOrderbook(u: unknown): RawOrderbook | null {
  if (!isRecord(u)) return null
  const bids = parseLevels(u.bids)
  const asks = parseLevels(u.asks)
  const tokenId = asString(u.tokenId)
  if (bids === null || asks === null || tokenId === null) return null
  return { bids, asks, tokenId }
}

// --- Perfil y posiciones ------------------------------------------------------------

export function parseProfile(u: unknown): RawProfile | null {
  if (!isRecord(u)) return null
  const id = asFiniteNumber(u.id)
  const account = asString(u.account)
  if (id === null || account === null) return null
  let feeRateBps = 0
  if (isRecord(u.rank)) {
    feeRateBps = asFiniteNumber(u.rank.feeRateBps) ?? 0
  }
  return { id, account, feeRateBps }
}

function parsePositionSide(u: unknown, balance: unknown): RawPositionSide | null {
  if (!isRecord(u)) return null
  const costRaw = asDigitString(u.cost)
  const marketValueRaw = asDigitString(u.marketValue)
  const fillPriceRaw = asDigitString(u.fillPrice)
  if (costRaw === null || marketValueRaw === null || fillPriceRaw === null) {
    return null
  }
  return { costRaw, marketValueRaw, fillPriceRaw, balanceRaw: asDigitString(balance) }
}

export function parseClobPositions(u: unknown): Parsed<RawClobPosition[]> | null {
  if (!isRecord(u) || !Array.isArray(u.clob)) return null

  const positions: RawClobPosition[] = []
  let dropped = 0
  for (const raw of u.clob) {
    if (!isRecord(raw) || !isRecord(raw.market) || !isRecord(raw.positions)) {
      dropped += 1
      continue
    }
    const slug = asString(raw.market.slug)
    if (slug === null) {
      dropped += 1
      continue
    }
    const balances = isRecord(raw.tokensBalance) ? raw.tokensBalance : {}
    const yes = parsePositionSide(raw.positions.yes, balances.yes)
    const no = parsePositionSide(raw.positions.no, balances.no)
    if (yes === null || no === null) {
      dropped += 1
      continue
    }
    positions.push({
      market: {
        slug,
        title: asString(raw.market.title),
        status: asString(raw.market.status),
        winningOutcomeIndex: asFiniteNumber(raw.market.winningOutcomeIndex),
        payoutNumerators: asNumberArray(raw.market.payoutNumerators),
      },
      yes,
      no,
    })
  }
  return { value: positions, dropped }
}

// --- Órdenes ---------------------------------------------------------------------------

export function parseCreateOrderResponse(u: unknown): RawCreateOrderResponse | null {
  if (!isRecord(u)) return null
  const execution = isRecord(u.execution) ? u.execution : null
  if (execution === null) return null
  const settlementStatus = asString(execution.settlementStatus)
  if (settlementStatus === null) return null
  return {
    orderId: asString(u.orderId),
    settlementStatus,
    matched: asBoolean(execution.matched, false),
    txHash: asString(execution.txHash),
    reason: asString(execution.reason),
  }
}
