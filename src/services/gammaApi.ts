/**
 * Cliente de la Gamma API de Polymarket (datos de mercados, solo lectura).
 *
 * Forma de la respuesta verificada contra la API real el 2026-08-26.
 *
 * Trampa importante: `outcomes`, `outcomePrices` y `clobTokenIds` NO llegan como
 * arrays. Llegan como **strings que contienen JSON**:
 *
 *   "clobTokenIds": "[\"271469...\", \"332166...\"]"
 *   "outcomePrices": "[\"0.006\", \"0.994\"]"
 *
 * El código anterior de este proyecto los tipaba como `number[]` y accedía a
 * `outcomePrices[0]`, lo que devolvía un carácter suelto (`"["`). Aquí se
 * parsean explícitamente.
 */

import { GAMMA_API_BASE } from '../config/polymarket'

/** Mercado tal como lo devuelve Gamma, con los campos que usamos. */
export interface GammaMarketRaw {
  id: string
  question: string
  slug?: string
  description?: string
  conditionId?: string
  questionID?: string
  /** JSON string, p.ej. '["Yes","No"]' */
  outcomes?: string
  /** JSON string, p.ej. '["0.53","0.47"]' */
  outcomePrices?: string
  /** JSON string con los token IDs del CLOB, en el mismo orden que outcomes */
  clobTokenIds?: string
  liquidityNum?: number
  volumeNum?: number
  volume24hr?: number
  liquidity?: string
  volume?: string
  active?: boolean
  closed?: boolean
  archived?: boolean
  /** Si el CLOB acepta órdenes ahora mismo. */
  acceptingOrders?: boolean
  enableOrderBook?: boolean
  /** Mercado de riesgo negativo: usa otro exchange y otro contrato de shares. */
  negRisk?: boolean
  endDate?: string
  endDateIso?: string
  image?: string
  icon?: string
  resolutionSource?: string
  /** Etiqueta corta de la opcion dentro de un evento multi-mercado. */
  groupItemTitle?: string
  /** Restricciones de orden que impone el CLOB. */
  orderPriceMinTickSize?: number
  orderMinSize?: number
  bestBid?: number
  bestAsk?: number
  spread?: number
  lastTradePrice?: number
  oneWeekPriceChange?: number
  events?: { title?: string; ticker?: string }[]
}

/** Mercado normalizado y listo para usar en la app. */
export interface RealMarket {
  id: string
  question: string
  description: string
  slug?: string
  conditionId: string
  /** ["Yes","No"] normalmente. */
  outcomes: string[]
  /** Token IDs del CLOB, alineados con `outcomes`. */
  clobTokenIds: string[]
  /**
   * Precios por resultado, 0..1, alineados por indice con `outcomes` y
   * `clobTokenIds`. `null` = sin precio conocido (libro vacio). NUNCA se
   * rellena con 0.5: eso producia los 50% repetidos.
   */
  prices: (number | null)[]
  liquidityUsd: number
  volumeUsd: number
  volume24hUsd: number
  endDate?: string
  negRisk: boolean
  acceptingOrders: boolean
  icon?: string
  resolutionSource?: string
  minTickSize: number
  minOrderSize: number
  bestBid?: number
  bestAsk?: number
  spread?: number
  lastTradePrice?: number
  eventTitle?: string
  /**
   * Etiqueta corta de la opcion ("25 bps decrease", "Real Madrid CF").
   * Es lo que Polymarket muestra en las tarjetas multi-opcion, mucho mas
   * legible que la pregunta completa.
   */
  optionLabel?: string
  /** true si es un mercado plantilla sin contendiente definido ("Team A"). */
  isPlaceholder: boolean
  /** true si hay al menos un precio real. */
  hasPrice: boolean
}

/**
 * Parsea un campo que puede venir como array o como string con JSON dentro.
 * Devuelve [] si no se puede interpretar, en lugar de lanzar.
 */
function parseJsonArrayField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string' || value.trim() === '') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Convierte a número o devuelve null si no hay un valor utilizable. */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Etiquetas plantilla que Polymarket usa en mercados aún sin definir.
 *
 * Son datos REALES de la API, no un fallo de parseo: para temporadas futuras
 * crea mercados con `groupItemTitle: "Team A"` y preguntas como "Will Team A
 * win the 2026-27 UEFA Champions League?". No hay ningún nombre que extraer
 * porque todavía no existe; lo correcto es marcarlos y no mostrarlos como si
 * fueran una opción real.
 */
const PLACEHOLDER_LABEL = /^(team|player|candidate|option|competitor)\s+[a-z0-9]{1,2}$/i

export function isPlaceholderLabel(label: string | undefined | null): boolean {
  if (!label) return false
  return PLACEHOLDER_LABEL.test(label.trim())
}

/**
 * Deduce la etiqueta de una opción, en orden de fiabilidad.
 *
 * 1. `groupItemTitle` — lo que usa la plataforma oficial. Suele estar y ser
 *    exacto ("Kylian Mbappé", "25 bps decrease").
 * 2. Si falta y los resultados NO son Yes/No, son los nombres reales de los
 *    contendientes: `["Tampa Bay Rays","Detroit Tigers"]`. Se usa el primero.
 * 3. Como último recurso se limpia la pregunta quitando la envoltura
 *    ("Will X win the 2026 Ballon d'Or?" -> "X"), en lugar de volcar la
 *    pregunta entera, que en estos eventos es repetitiva e ilegible.
 */
function deriveOptionLabel(
  groupItemTitle: string | undefined,
  question: string,
  outcomes: string[],
): string {
  const git = groupItemTitle?.trim()
  if (git) return git

  const isYesNo =
    outcomes.length === 2 &&
    outcomes[0]?.toLowerCase() === 'yes' &&
    outcomes[1]?.toLowerCase() === 'no'
  if (!isYesNo && outcomes[0]?.trim()) return outcomes[0].trim()

  return cleanQuestionToLabel(question)
}

/**
 * Extrae el sujeto de una pregunta de mercado.
 *
 * "Will Kylian Mbappé win the 2026 Ballon d'Or?" -> "Kylian Mbappé"
 * "Will the Fed cut rates in September?"         -> "the Fed cut rates in September"
 *
 * No es perfecto y no pretende serlo: es el último recurso, y devolver algo
 * legible es mejor que un comodín vacío o la pregunta de 80 caracteres.
 */
export function cleanQuestionToLabel(question: string): string {
  const q = (question ?? '').trim().replace(/\?+$/, '')
  if (!q) return 'Opción sin nombre'

  // "Will X win/join/be ..." -> X
  const willMatch = q.match(
    /^will\s+(.+?)\s+(win|join|be|become|reach|hit|sign|transfer|advance|qualify)\b/i,
  )
  if (willMatch?.[1]) return willMatch[1].trim()

  // "Will X ..." -> X (sin verbo reconocido)
  const bareWill = q.match(/^will\s+(.+)$/i)
  if (bareWill?.[1]) {
    const rest = bareWill[1].trim()
    return rest.length > 42 ? `${rest.slice(0, 42)}…` : rest
  }

  return q.length > 46 ? `${q.slice(0, 46)}…` : q
}

/**
 * Normaliza un mercado de Gamma. Devuelve null si le falta lo imprescindible
 * para poder operar (token IDs o conditionId), en vez de dejar pasar un
 * mercado a medias que reventaría al firmar una orden.
 */
export function normalizeMarket(raw: GammaMarketRaw): RealMarket | null {
  const clobTokenIds = parseJsonArrayField(raw.clobTokenIds)
  const outcomes = parseJsonArrayField(raw.outcomes)
  const priceStrings = parseJsonArrayField(raw.outcomePrices)

  if (!raw.conditionId) return null
  if (clobTokenIds.length < 2) return null
  if (outcomes.length !== clobTokenIds.length) return null

  /**
   * Precios emparejados por ÍNDICE con `clobTokenIds` y `outcomes`: los tres
   * arrays vienen alineados desde la API, y el índice es lo que después se usa
   * para elegir el token al firmar una orden. Desalinearlos compraría el
   * resultado equivocado.
   *
   * `null` significa "sin precio conocido", no 0.5.
   *
   * Antes había un valor por defecto de 0.5 aquí, y era la causa de los 50%
   * repetidos: 3.035 de 19.131 mercados operables (16%) llegan sin
   * `outcomePrices`, y todos ellos con `bestBid: 0` / `bestAsk: 1`, es decir
   * libro vacío. Su punto medio es exactamente 0.5, así que derivarlo del
   * libro reproduce el mismo engaño. Sin mercado no hay probabilidad que
   * mostrar.
   */
  /**
   * Detección de "mercado inexistente".
   *
   * Aquí está la causa real de los 50% en cascada, y no era un valor por
   * defecto nuestro: **la propia API devuelve `["0.5","0.5"]`** para mercados
   * que no tienen libro. Ejemplo medido en "Where will Julian Alvarez
   * transfer?", donde 11 de 17 opciones llegan así:
   *
   *   git="Team A"  outcomePrices=["0.5","0.5"]  bid=0  ask=1  last=0  liq=0
   *   git="Arsenal" outcomePrices=["0.4615",…]   bid=0.44 ask=0.483 last=0.44
   *
   * El discriminador NO es el 0.5 —un mercado real puede estar legítimamente
   * a 50/50— sino el **libro vacío**: diferencial que abarca todo el rango
   * (bid 0 / ask 1), nunca negociado y sin liquidez. Un 50/50 auténtico tiene
   * libro alrededor de 0.5.
   */
  const bid = toNumberOrNull(raw.bestBid) ?? 0
  const ask = toNumberOrNull(raw.bestAsk) ?? 1
  const fullSpread = ask - bid >= 0.99
  const neverTraded = toNumber(raw.lastTradePrice, 0) === 0
  const noLiquidity = toNumber(raw.liquidityNum ?? raw.liquidity, 0) === 0
  const hasNoMarket = fullSpread && (neverTraded || noLiquidity)

  /**
   * Precios emparejados por ÍNDICE con `clobTokenIds` y `outcomes`: los tres
   * arrays vienen alineados desde la API, y el índice es lo que después se usa
   * para elegir el token al firmar una orden. Desalinearlos compraría el
   * resultado equivocado.
   *
   * `null` significa "sin precio conocido". Nunca se inventa un 0.5.
   */
  const prices: (number | null)[] = clobTokenIds.map((_, i) => {
    if (hasNoMarket) return null

    const fromApi = toNumberOrNull(priceStrings[i])
    if (fromApi !== null) return fromApi

    // Sin `outcomePrices` pero con libro: se deriva del último negociado.
    const last = toNumberOrNull(raw.lastTradePrice)
    if (last !== null && last > 0 && last < 1) {
      return i === 0 ? last : 1 - last
    }

    return null
  })

  const label = deriveOptionLabel(raw.groupItemTitle, raw.question, outcomes)

  return {
    id: raw.id,
    question: raw.question,
    description: raw.description ?? '',
    slug: raw.slug,
    conditionId: raw.conditionId,
    outcomes,
    clobTokenIds,
    prices,
    liquidityUsd: toNumber(raw.liquidityNum ?? raw.liquidity),
    volumeUsd: toNumber(raw.volumeNum ?? raw.volume),
    volume24hUsd: toNumber(raw.volume24hr),
    endDate: raw.endDateIso ?? raw.endDate,
    negRisk: raw.negRisk === true,
    acceptingOrders: raw.acceptingOrders === true,
    icon: raw.icon ?? raw.image,
    resolutionSource: raw.resolutionSource || undefined,
    // Valores por defecto conservadores si Gamma no los trae.
    minTickSize: toNumber(raw.orderPriceMinTickSize, 0.001),
    minOrderSize: toNumber(raw.orderMinSize, 5),
    bestBid: raw.bestBid,
    bestAsk: raw.bestAsk,
    spread: raw.spread,
    lastTradePrice: raw.lastTradePrice,
    eventTitle: raw.events?.[0]?.title,
    optionLabel: label,
    isPlaceholder:
      isPlaceholderLabel(raw.groupItemTitle) || isPlaceholderLabel(label),
    hasPrice: prices.some((v) => v !== null),
  }
}

/**
 * Límite máximo por petición que acepta la Gamma API.
 *
 * Medido: pedir 500 devuelve 100. Pedirlo de más no da error, simplemente
 * recorta, lo que es fácil confundir con "ya no hay más resultados".
 */
export const GAMMA_MAX_LIMIT = 100

/**
 * Techo de paginación de la API: a partir de este offset responde HTTP 422.
 *
 * Medido recorriendo páginas: hay ~2.100 mercados abiertos y operables y el
 * offset 2100 ya falla.
 */
export const GAMMA_MAX_OFFSET = 2100

export interface FetchMarketsOptions {
  limit?: number
  offset?: number
  /** Ordena por este campo (p.ej. 'volume24hr', 'liquidityNum'). */
  order?: string
  ascending?: boolean
  /** Filtra por slug de etiqueta (p.ej. 'crypto', 'politics'). */
  tagSlug?: string
  signal?: AbortSignal
}

export interface MarketsPage {
  markets: RealMarket[]
  /** Cuántos devolvió la API antes de normalizar (para saber si quedan más). */
  rawCount: number
  /** Offset a pedir para la página siguiente, o null si no hay más. */
  nextOffset: number | null
}

/**
 * Trae mercados abiertos y operables, ordenados por volumen 24h.
 *
 * Pide más de los necesarios porque se descartan los que no tienen libro o
 * les falta información para operar.
 */
export async function fetchMarketsPage(
  options: FetchMarketsOptions = {},
): Promise<MarketsPage> {
  const {
    limit = GAMMA_MAX_LIMIT,
    offset = 0,
    order = 'liquidityNum',
    ascending = false,
    tagSlug,
    signal,
  } = options

  const effectiveLimit = Math.min(limit, GAMMA_MAX_LIMIT)

  const params = new URLSearchParams({
    closed: 'false',
    archived: 'false',
    active: 'true',
    // Solo mercados con libro de órdenes: sin esto no se puede operar.
    enableOrderBook: 'true',
    limit: String(effectiveLimit),
    offset: String(offset),
    order,
    ascending: String(ascending),
  })
  if (tagSlug) params.set('tag_slug', tagSlug)

  const res = await fetch(`${GAMMA_API_BASE}/markets?${params}`, { signal })
  if (!res.ok) {
    // Pasado el techo de paginación la API responde 422; se trata como fin de
    // resultados en lugar de como error.
    if (res.status === 422) {
      return { markets: [], rawCount: 0, nextOffset: null }
    }
    throw new Error(`Gamma API respondió ${res.status} ${res.statusText}`)
  }

  const data: unknown = await res.json()
  // Gamma devuelve un array directo (verificado); se admite {markets:[...]} por si cambia.
  const list: GammaMarketRaw[] = Array.isArray(data)
    ? (data as GammaMarketRaw[])
    : ((data as { markets?: GammaMarketRaw[] })?.markets ?? [])

  const markets = list
    .map(normalizeMarket)
    .filter((m): m is RealMarket => m !== null)

  // Si la API devolvió menos de lo pedido, se agotaron los resultados.
  const candidateNext = offset + effectiveLimit
  const nextOffset =
    list.length < effectiveLimit || candidateNext >= GAMMA_MAX_OFFSET
      ? null
      : candidateNext

  return { markets, rawCount: list.length, nextOffset }
}

/** Compatibilidad: una sola página, solo los mercados. */
export async function fetchMarkets(
  options: FetchMarketsOptions = {},
): Promise<RealMarket[]> {
  const page = await fetchMarketsPage(options)
  return page.markets
}

/**
 * Categorías de nivel superior, al estilo de la navegación de Polymarket.
 *
 * Cada slug está VERIFICADO contra la API: devuelve eventos reales con
 * mercados operables. Se probaron 40 candidatos y varios que parecen obvios no
 * existen (`entertainment`, `financials`, `companies` devuelven 0 eventos), por
 * eso la lista es esta y no la que uno supondría.
 *
 * IMPORTANTE: el filtro por etiqueta solo funciona en `/events`. En `/markets`
 * el parámetro `tag_slug` se IGNORA silenciosamente: pedir `politics`, `sports`
 * o un slug inventado devuelve exactamente los mismos IDs. Construir pestañas
 * sobre `/markets?tag_slug=` daría una UI que parece funcionar mostrando
 * siempre lo mismo.
 */
export const CATEGORIES = [
  { slug: null, label: 'Tendencia', order: 'volume24hr' },
  // "Nuevo" no es una etiqueta: es el catálogo ordenado por fecha de creación.
  { slug: null, label: 'Nuevo', order: 'creationDate', key: 'new' },
  { slug: 'politics', label: 'Política' },
  { slug: 'sports', label: 'Deportes' },
  { slug: 'crypto', label: 'Cripto' },
  { slug: 'esports', label: 'Esports' },
  { slug: 'geopolitics', label: 'Geopolítica' },
  { slug: 'finance', label: 'Finanzas' },
  { slug: 'economy', label: 'Economía' },
  { slug: 'tech', label: 'Tecnología' },
  { slug: 'pop-culture', label: 'Cultura' },
  { slug: 'weather', label: 'Clima' },
  { slug: 'elections', label: 'Elecciones' },
  { slug: 'awards', label: 'Premios' },
] as const

export type CategorySlug = string | null

/** Identificador estable de pestaña (el label sirve, y `new` desambigua). */
export type CategoryKey = string

/**
 * Subcategorías de Deportes, con los slugs REALES de la API.
 *
 * Verificadas una a una contando eventos y liquidez. Cuatro candidatos obvios
 * NO existen: `formula-1` (el bueno es `f1`), `college-basketball`, `athletics`,
 * `darts` y `snooker` devuelven 0 eventos.
 *
 * Cuando dos slugs se solapan se toma el de más liquidez:
 *   baseball / mlb            -> mlb (2.443 mercados)
 *   football / nfl            -> nfl
 *   epl / premier-league      -> premier-league
 *   mma / ufc                 -> ufc (mucho más volumen)
 */
export const SPORTS_SUBCATEGORIES = [
  { slug: 'sports', label: 'Todos' },
  { slug: 'soccer', label: 'Fútbol' },
  { slug: 'basketball', label: 'Baloncesto' },
  { slug: 'mlb', label: 'Béisbol' },
  { slug: 'tennis', label: 'Tenis' },
  { slug: 'nfl', label: 'NFL' },
  { slug: 'f1', label: 'F1' },
  { slug: 'ufc', label: 'UFC' },
  { slug: 'nhl', label: 'Hockey' },
  { slug: 'golf', label: 'Golf' },
  { slug: 'esports', label: 'Esports' },
  { slug: 'cricket', label: 'Críquet' },
  { slug: 'chess', label: 'Ajedrez' },
] as const

interface GammaEventRaw {
  id: string
  title?: string
  slug?: string
  ticker?: string
  description?: string
  image?: string
  icon?: string
  liquidity?: number
  volume?: number
  volume24hr?: number
  openInterest?: number
  commentCount?: number
  endDate?: string
  startDate?: string
  new?: boolean
  featured?: boolean
  live?: boolean
  ended?: boolean
  negRisk?: boolean
  /** Pistas de presentación que usa la propia UI de Polymarket. */
  showAllOutcomes?: boolean
  showMarketImages?: boolean
  markets?: GammaMarketRaw[]
  tags?: { slug?: string; label?: string }[]
}

/**
 * Evento normalizado: la unidad que se muestra en una tarjeta.
 *
 * Un evento agrupa mercados relacionados. "Fed Decision in September?" contiene
 * un mercado por resultado posible ("25 bps decrease", "No change"...), y
 * "Real Madrid vs Real Sociedad" contiene uno por desenlace. Es la estructura
 * que usa Polymarket y la razón de que sus tarjetas puedan mostrar varias
 * opciones con su porcentaje.
 */
export interface RealEvent {
  id: string
  title: string
  slug?: string
  description?: string
  /** Imagen oficial del evento (S3 de Polymarket). */
  image?: string
  icon?: string
  liquidityUsd: number
  volumeUsd: number
  volume24hUsd: number
  openInterestUsd: number
  commentCount: number
  endDate?: string
  isNew: boolean
  featured: boolean
  live: boolean
  /** Etiquetas del evento, útiles para mostrar contexto. */
  tags: string[]
  /** Mercados operables, ordenados por probabilidad descendente. */
  markets: RealMarket[]
  /**
   * true si es un evento binario simple: un único mercado Sí/No.
   * La tarjeta lo presenta con un porcentaje grande en vez de una lista.
   */
  isBinary: boolean
  /** Alguno de sus mercados es negRisk. */
  hasNegRisk: boolean
}

/**
 * Normaliza un evento. Devuelve null si no le queda ningún mercado operable:
 * un evento sin mercados con libro no sirve para nada en modo real.
 */
export function normalizeEvent(raw: GammaEventRaw): RealEvent | null {
  const markets: RealMarket[] = []
  for (const rawMarket of raw.markets ?? []) {
    if (rawMarket.enableOrderBook !== true) continue
    if (rawMarket.acceptingOrders !== true) continue
    const norm = normalizeMarket(rawMarket)
    if (norm) markets.push(norm)
  }

  if (markets.length === 0) return null

  /**
   * Orden: primero las opciones con precio conocido, de mayor a menor
   * probabilidad; después las que no tienen mercado; y al final las plantilla
   * sin contendiente definido.
   *
   * Así una opción sin libro no se cuela arriba fingiendo ser probable, que es
   * lo que ocurría cuando su precio ausente se rellenaba con 0.5.
   */
  const rank = (m: RealMarket) => (m.isPlaceholder ? 2 : m.hasPrice ? 0 : 1)
  markets.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    return (b.prices[0] ?? 0) - (a.prices[0] ?? 0)
  })

  return {
    id: raw.id,
    title: raw.title ?? '(sin título)',
    slug: raw.slug,
    description: raw.description,
    image: raw.image ?? raw.icon,
    icon: raw.icon ?? raw.image,
    liquidityUsd: toNumber(raw.liquidity),
    volumeUsd: toNumber(raw.volume),
    volume24hUsd: toNumber(raw.volume24hr),
    openInterestUsd: toNumber(raw.openInterest),
    commentCount: toNumber(raw.commentCount),
    endDate: raw.endDate,
    isNew: raw.new === true,
    featured: raw.featured === true,
    live: raw.live === true,
    tags: (raw.tags ?? [])
      .map((t) => t.slug)
      .filter((s): s is string => Boolean(s)),
    markets,
    isBinary: markets.length === 1,
    hasNegRisk: markets.some((m) => m.negRisk),
  }
}

export interface EventsPage {
  events: RealEvent[]
  rawCount: number
  nextOffset: number | null
}

/**
 * Trae una página de eventos.
 *
 * Recordatorio de por qué esto va contra `/events` y no `/markets`: el filtro
 * `tag_slug` solo se respeta aquí. En `/markets` se ignora en silencio y
 * devuelve lo mismo para cualquier etiqueta, incluida una inventada.
 */
export async function fetchEventsPage(options: {
  tagSlug?: string | null
  /** Campo de orden. En /events es `liquidity`/`volume24hr`, no `liquidityNum`. */
  order?: string
  ascending?: boolean
  limit?: number
  offset?: number
  signal?: AbortSignal
}): Promise<EventsPage> {
  const {
    tagSlug,
    order = 'volume24hr',
    ascending = false,
    limit = GAMMA_MAX_LIMIT,
    offset = 0,
    signal,
  } = options

  const effective = Math.min(limit, GAMMA_MAX_LIMIT)
  const params = new URLSearchParams({
    closed: 'false',
    archived: 'false',
    active: 'true',
    limit: String(effective),
    offset: String(offset),
    order,
    ascending: String(ascending),
  })
  if (tagSlug) params.set('tag_slug', tagSlug)

  const res = await fetch(`${GAMMA_API_BASE}/events?${params}`, { signal })
  if (!res.ok) {
    if (res.status === 422) return { events: [], rawCount: 0, nextOffset: null }
    throw new Error(`Gamma API respondió ${res.status} ${res.statusText}`)
  }

  const data: unknown = await res.json()
  const raws: GammaEventRaw[] = Array.isArray(data) ? data : []

  const events = raws
    .map(normalizeEvent)
    .filter((e): e is RealEvent => e !== null)

  const nextOffset =
    raws.length < effective || offset + effective >= GAMMA_MAX_OFFSET
      ? null
      : offset + effective

  return { events, rawCount: raws.length, nextOffset }
}

/**
 * Trae los mercados de una categoría a través de `/events`.
 *
 * Un evento agrupa varios mercados (p.ej. "Nominado demócrata 2028" contiene
 * un mercado por candidato), así que se aplanan. Se filtran los que no tienen
 * libro o no aceptan órdenes: en modo real no sirven para nada.
 */
export async function fetchMarketsByTag(options: {
  tagSlug: string
  /** Nº de EVENTOS a pedir (cada uno aporta varios mercados). Máx 100. */
  eventLimit?: number
  offset?: number
  signal?: AbortSignal
}): Promise<MarketsPage> {
  const { tagSlug, eventLimit = 60, offset = 0, signal } = options

  const params = new URLSearchParams({
    closed: 'false',
    archived: 'false',
    active: 'true',
    limit: String(Math.min(eventLimit, GAMMA_MAX_LIMIT)),
    offset: String(offset),
    // En /events el campo de orden es `liquidity`, no `liquidityNum`.
    order: 'liquidity',
    ascending: 'false',
    tag_slug: tagSlug,
  })

  const res = await fetch(`${GAMMA_API_BASE}/events?${params}`, { signal })
  if (!res.ok) {
    if (res.status === 422) return { markets: [], rawCount: 0, nextOffset: null }
    throw new Error(`Gamma API respondió ${res.status} ${res.statusText}`)
  }

  const data: unknown = await res.json()
  const events: GammaEventRaw[] = Array.isArray(data) ? data : []

  const markets: RealMarket[] = []
  for (const ev of events) {
    for (const raw of ev.markets ?? []) {
      if (raw.enableOrderBook !== true) continue
      if (raw.acceptingOrders !== true) continue
      const norm = normalizeMarket(raw)
      if (!norm) continue
      // El título del evento da contexto a la tarjeta ("Nominado demócrata
      // 2028" sobre "¿Ganará Newsom?").
      markets.push({ ...norm, eventTitle: norm.eventTitle ?? ev.title })
    }
  }

  // Los mercados de un mismo evento vienen en orden arbitrario.
  markets.sort((a, b) => b.liquidityUsd - a.liquidityUsd)

  const effective = Math.min(eventLimit, GAMMA_MAX_LIMIT)
  const nextOffset =
    events.length < effective || offset + effective >= GAMMA_MAX_OFFSET
      ? null
      : offset + effective

  return { markets, rawCount: events.length, nextOffset }
}

/** Trae un mercado por su conditionId. */
export async function fetchMarketByConditionId(
  conditionId: string,
  signal?: AbortSignal,
): Promise<RealMarket | null> {
  const res = await fetch(
    `${GAMMA_API_BASE}/markets?condition_ids=${conditionId}`,
    { signal },
  )
  if (!res.ok) return null
  const data: unknown = await res.json()
  const list: GammaMarketRaw[] = Array.isArray(data) ? data : []
  const first = list[0]
  return first ? normalizeMarket(first) : null
}
