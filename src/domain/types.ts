/**
 * MODELO DE DOMINIO — PROPUESTA FASE 1, PENDIENTE DE REVISIÓN
 *
 * Este archivo es lo ÚNICO que la UI conoce. Ningún componente debe volver a
 * importar un tipo, campo o endpoint de un venue concreto.
 *
 * Nada lo importa todavía. Es una propuesta para revisar; compila, pero no
 * está conectado.
 *
 * Cada desviación respecto al punto de partida va marcada con [DESVIACIÓN N]
 * y justificada en el sitio. Las decisiones que tomé por ti, al no tener
 * respuesta a las preguntas de la Fase 0, van marcadas con [DECISIÓN N].
 */

// ---------------------------------------------------------------------------
// Primitivas de valor
// ---------------------------------------------------------------------------

/**
 * Importe decimal como string. Nunca `number`.
 *
 * El tipo va "marcado" (branded) para que el compilador impida pasar un string
 * cualquiera donde se espera dinero, y para que un `number` no cuele por
 * accidente. Se construye solo con `toDecimal()`.
 */
export type DecimalString = string & { readonly __brand: 'DecimalString' }

/** Constructor validador. Lanza en el borde, nunca en medio del dominio. */
export function toDecimal(value: string): DecimalString {
  if (!/^-?\d+(\.\d+)?$/.test(value.trim())) {
    throw new TypeError(`Importe decimal inválido: ${JSON.stringify(value)}`)
  }
  return value.trim() as DecimalString
}

/**
 * [DESVIACIÓN 1] — `liquidityUsd` y `volume24hUsd` siguen siendo `number`.
 *
 * Tu regla dice "cero `number` para dinero", pero tu propio snippet los declara
 * `number | null`. Resuelvo la contradicción distinguiendo dos cosas que no son
 * lo mismo:
 *
 *   - Importes de EJECUCIÓN (stake, payout): `DecimalString`. Un error de coma
 *     flotante aquí cuesta dinero.
 *   - Métricas AGREGADAS de presentación (liquidez del pool, volumen 24h):
 *     `ApproxUsd`. Solo se muestran y se ordenan. Perder precisión en el
 *     decimoquinto dígito de una cifra de $5M no tiene consecuencia, y
 *     convertirlas a string obligaría a parsear en cada `sort()` de la UI.
 *
 * El nombre del tipo hace la distinción explícita para que nadie use uno donde
 * va el otro. Si prefieres string absoluto sin excepción, dilo y lo cambio.
 */
export type ApproxUsd = number

/**
 * Identificador de venue.
 *
 * [DESVIACIÓN 2] — string, NO la unión `'azuro' | 'limitless'`.
 *
 * Tu criterio de éxito es "añadir un tercer venue debe costar un archivo nuevo
 * y cero cambios en la UI". Una unión cerrada lo impide por construcción:
 * añadir un venue obligaría a editar este archivo, y cualquier `switch`
 * exhaustivo en la UI dejaría de compilar. Justo el acoplamiento que quieres
 * eliminar, movido un nivel arriba.
 *
 * Los ids concretos viven en el registry, que es configurable por entorno.
 */
export type VenueId = string

/** Formato del precio nativo que cotiza un venue. */
export type PriceFormat =
  /** Cuota decimal: 2.5 significa "pagas 1, cobras 2.5". Azuro. */
  | 'decimal-odds'
  /** Precio 0..1, que coincide con la probabilidad. Limitless. */
  | 'probability'

// ---------------------------------------------------------------------------
// Mercado
// ---------------------------------------------------------------------------

export type MarketStatus = 'open' | 'suspended' | 'closed' | 'resolved'

export interface Outcome {
  /** Id estable dentro del mercado. */
  id: string
  label: string
  /**
   * Probabilidad implícita 0..1, o `null` si el venue no cotiza ahora mismo.
   *
   * `null` NO es 0. La UI debe renderizar "sin cotización", jamás "0%".
   * Este es el bug que arrastras hoy y el motivo de que el tipo sea nullable
   * en lugar de tener un valor por defecto.
   */
  probability: number | null
  /** Precio nativo del venue, en el formato que declara `Market.priceFormat`. */
  price: DecimalString | null
  /**
   * [DESVIACIÓN 3] — `isQuotable` vive AQUÍ, no solo en `Market`.
   *
   * La cotizabilidad es por resultado, no por mercado. En un order book un
   * resultado puede tener libro y el contrario no: tu propia Fase 3 dice que
   * si falta bid o ask, `probability` es null y `isQuotable` false — eso solo
   * se puede expresar por outcome. `Market.isQuotable` queda como derivado.
   */
  isQuotable: boolean
  /** Resultado ganador, cuando el mercado está resuelto. */
  isWinner?: boolean
}

/**
 * [DECISIÓN 2] — Agrupación de mercados: `group`, no una entidad `Event`.
 *
 * Preguntaba si conservar el nivel de "evento". Propongo un campo opcional en
 * `Market` en lugar de una segunda entidad, por tres razones:
 *
 *  1. Mantiene `Market` como la única unidad que la UI conoce, que es lo que
 *     pedía tu spec.
 *  2. `EventCard` puede seguir agrupando por `group.id` sin que exista un
 *     `Event` en el dominio.
 *  3. Funciona cuando un venue no agrupa: el campo simplemente falta. Una
 *     entidad `Event` obligaría a inventar eventos de un solo mercado.
 *
 * En Azuro esto es el partido (`game`); en Limitless puede no haber nada.
 */
export interface MarketGroup {
  id: string
  label: string
  imageUrl?: string
  /**
   * Participantes del evento (equipos, jugadores), en el orden que publica el
   * venue. Solo presentación: la UI puede pintar un enfrentamiento "A vs B"
   * cuando hay exactamente dos.
   */
  participants?: { name: string; imageUrl?: string }[]
  /** Nombre de la competición (liga, torneo), si el venue lo aporta. */
  leagueName?: string
  /** El evento está en juego ahora mismo (partido en vivo). */
  isLive?: boolean
}

export interface Market {
  /** `${venue}:${nativeId}`. Único en toda la app. */
  id: string
  venue: VenueId
  chainId: number
  question: string
  /** Categoría ya normalizada al dominio. Ver `MarketCategory`. */
  category: MarketCategory
  /** Subcategoría normalizada, si el venue la aporta (liga, deporte…). */
  subcategory?: string
  outcomes: Outcome[]
  status: MarketStatus
  closesAt: Date | null
  /** Ver [DESVIACIÓN 1]: métrica de presentación, no de ejecución. */
  liquidityUsd: ApproxUsd | null
  volume24hUsd: ApproxUsd | null
  /**
   * ¿Se puede pedir cotización ejecutable ahora mismo?
   *
   * DERIVADO: verdadero si algún outcome es cotizable Y el estado es 'open'.
   * El adaptador lo calcula; la UI solo lo lee. En un AMM como Azuro refleja
   * el estado real de la condición (activa/suspendida/resuelta), no la
   * existencia de un libro.
   */
  isQuotable: boolean
  /** Formato de `Outcome.price`, constante por venue. */
  priceFormat: PriceFormat
  group?: MarketGroup
  imageUrl?: string
  /** Payload original. SOLO para depurar. La UI no debe leerlo nunca. */
  raw?: unknown
}

/**
 * Categorías del dominio.
 *
 * [DECISIÓN 5] — Taxonomía unificada, con el venue invisible.
 *
 * Preguntaba si separar por venue. Unifico porque es lo único compatible con
 * tu restricción arquitectónica: si las pestañas fueran "Deportes = Azuro" y
 * "Mercados = Limitless", la UI sabría qué venue atiende cada pestaña y el
 * acoplamiento volvería por la puerta de atrás.
 *
 * Cada adaptador traduce su jerarquía nativa a este conjunto. Lo que no encaja
 * cae en 'other' en lugar de inventar una categoría.
 */
export type MarketCategory =
  | 'sports'
  | 'politics'
  | 'crypto'
  | 'economy'
  | 'tech'
  | 'culture'
  | 'weather'
  | 'other'

// ---------------------------------------------------------------------------
// Cotización y ejecución
// ---------------------------------------------------------------------------

export interface Quote {
  marketId: string
  outcomeId: string
  /** Importe apostado. Decimal en string. */
  stake: DecimalString
  /** Pago total esperado si acierta, stake incluido. */
  expectedPayout: DecimalString
  /**
   * Impacto en precio 0..1, o `null` si el venue no lo expone.
   * En un AMM es real; en un order book sale de recorrer el libro.
   */
  priceImpact: number | null
  expiresAt: Date | null
  /**
   * [DESVIACIÓN 4] — datos opacos del venue para la ejecución.
   *
   * `placeBet(quote)` necesita a veces algo que el venue emitió al cotizar:
   * en Azuro los parámetros firmados de la apuesta, en un order book el id de
   * la orden. Sin este campo el adaptador tendría que volver a cotizar al
   * ejecutar, y el precio podría haber cambiado entre ambas llamadas.
   *
   * Es `unknown` a propósito: solo el adaptador que lo creó lo interpreta, y
   * la UI no puede leerlo sin un cast que delatará el acoplamiento en revisión.
   */
  venueData: unknown
}

export interface BetOptions {
  /** Slippage tolerado 0..1. El adaptador lo traduce a lo que exija el venue. */
  slippageTolerance: number
  /** Dirección que firma. La wallet la aporta la capa de UI. */
  from: string
  /** Timeout en ms para la operación completa. */
  deadlineMs?: number
}

export interface BetReceipt {
  marketId: string
  outcomeId: string
  stake: DecimalString
  /** Hash de la transacción on-chain, o id de orden si el venue es off-chain. */
  reference: string
  /** URL al explorador o a la orden, ya construida por el adaptador. */
  explorerUrl: string | null
  placedAt: Date
  /**
   * `pending`: enviada, sin confirmar.
   * `confirmed`: liquidada.
   * `failed`: rechazada. El motivo va en `VenueError`, no aquí.
   */
  status: 'pending' | 'confirmed' | 'failed'
}

export interface Position {
  /** Id único de la posición dentro del venue. Necesario para operarla. */
  id: string
  marketId: string
  outcomeId: string
  /** Etiquetas desnormalizadas para no exigir un fetch extra al listar. */
  marketQuestion: string
  outcomeLabel: string
  stake: DecimalString
  /** Pago si acierta. */
  potentialPayout: DecimalString
  /** Valor actual estimado, o `null` si no se puede valorar ahora. */
  currentValue: DecimalString | null
  status: 'open' | 'won' | 'lost' | 'redeemable' | 'redeemed'
  /**
   * [DESVIACIÓN 8] — `Date | null`, no `Date`.
   *
   * Limitless no devuelve la fecha de apertura en su endpoint de posiciones
   * (solo coste, precio medio y valor actual). Inventar una fecha sería
   * mentir; `null` obliga a la UI a tratar el caso "sin fecha".
   */
  openedAt: Date | null
  /**
   * Datos opacos del venue para OPERAR la posición (cobrarla, por ejemplo);
   * mismo contrato que `Quote.venueData`: solo el adaptador que los creó los
   * interpreta, la UI no los lee jamás. Ausente si la posición no admite
   * ninguna operación.
   */
  venueData?: unknown
}

/** Recibo del cobro de una posición ('redeemable' → 'redeemed'). */
export interface RedeemReceipt {
  positionId: string
  /** Hash de la transacción on-chain del cobro. */
  reference: string
  /** URL al explorador, ya construida por el adaptador, o null. */
  explorerUrl: string | null
  redeemedAt: Date
}

// ---------------------------------------------------------------------------
// Errores tipados
// ---------------------------------------------------------------------------

/**
 * [DESVIACIÓN 5] — los métodos devuelven `Result`, no lanzan.
 *
 * Tu estándar dice "los errores se manejan en el adaptador y se exponen como
 * resultados tipados; la UI no ve excepciones crudas". Tu snippet, en cambio,
 * devuelve `Promise<Market[]>`, que solo puede comunicar un fallo lanzando.
 *
 * Con `Result` el compilador obliga a tratar el error: no se puede leer
 * `.data` sin comprobar `.ok` primero. Es más verboso, y es el precio de que
 * un fallo de red no llegue a la UI como excepción.
 */
export type VenueErrorKind =
  /** Red, DNS, timeout, CORS. */
  | 'network'
  /** La respuesta no valida contra el esquema esperado. */
  | 'invalid_response'
  /** El venue rechazó por jurisdicción o cumplimiento. */
  | 'blocked'
  /** El mercado no existe o ya no cotiza. */
  | 'not_found'
  /** El mercado existe pero no acepta esta operación ahora. */
  | 'not_quotable'
  /** Wallet no conectada, red incorrecta, saldo o allowance insuficiente. */
  | 'wallet'
  /** El usuario rechazó la firma. */
  | 'rejected'
  /** El venue no soporta esta operación. Ver `VenueCapabilities`. */
  | 'unsupported'
  /** Cualquier otra cosa. Lleva `cause` para depurar. */
  | 'unknown'

export interface VenueError {
  kind: VenueErrorKind
  /** Mensaje ya legible para mostrar al usuario. Sin jerga de la API. */
  message: string
  venue: VenueId
  /** Error original, solo para logs. */
  cause?: unknown
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: VenueError }

// ---------------------------------------------------------------------------
// Filtro de listado
// ---------------------------------------------------------------------------

/**
 * [DESVIACIÓN 6] — `MarketFilter` estaba referenciado pero no definido.
 *
 * La regla "un mercado cerrado o con `closesAt` pasado no aparece por defecto"
 * se hace cumplir aquí: hay que pedir `includeClosed: true` EXPLÍCITAMENTE
 * para verlos. Omitir el campo nunca los muestra, así que el descuido por
 * defecto es el comportamiento seguro.
 */
export interface MarketFilter {
  category?: MarketCategory
  subcategory?: string
  /** Búsqueda por texto libre. */
  query?: string
  /** Solo estos venues. Si falta, todos los registrados. */
  venues?: VenueId[]
  /** Por defecto false: los cerrados y resueltos NO se listan. */
  includeClosed?: boolean
  /** Por defecto false: los no cotizables NO se listan. */
  includeNonQuotable?: boolean
  limit?: number
  /** Cursor opaco de paginación. Cada venue define su forma. */
  cursor?: string
}

export interface MarketPage {
  markets: Market[]
  /** Cursor para la página siguiente, o `null` si no hay más. */
  nextCursor: string | null
}

// ---------------------------------------------------------------------------
// Puerto: MarketSource
// ---------------------------------------------------------------------------

/**
 * [DESVIACIÓN 7] — capacidades declaradas.
 *
 * Preguntaba si implementar `placeBet` en Limitless. Con esto la pregunta deja
 * de ser bloqueante: un venue declara qué sabe hacer, la UI lo consulta y
 * oculta o desactiva lo que no está disponible. Un método no soportado
 * devuelve `{ ok: false, error: { kind: 'unsupported' } }` en vez de lanzar.
 *
 * Alternativa descartada: métodos opcionales (`placeBet?`). Obligaría a la UI
 * a comprobar `typeof source.placeBet === 'function'`, que es más frágil y no
 * se puede mostrar en la interfaz.
 */
export interface VenueCapabilities {
  canQuote: boolean
  canPlaceBet: boolean
  canReadPositions: boolean
  canSubscribe: boolean
  /** Búsqueda por texto en el servidor del venue. */
  canSearch: boolean
  /** Enumerar las subcategorías activas de una categoría (deportes, etc.). */
  canListSubcategories: boolean
  /** Cobrar posiciones ganadoras/canceladas ('redeemable'). */
  canRedeem: boolean
}

/**
 * Subcategoría activa de una categoría del dominio (un deporte dentro de
 * 'sports', por ejemplo). `id` es el valor que se pasa en
 * `MarketFilter.subcategory` y coincide con `Market.subcategory`.
 */
export interface Subcategory {
  id: string
  /** Nombre tal y como lo publica el venue. La UI puede traducirlo. */
  label: string
  /** Mercados/eventos activos ahora mismo, o `null` si el venue no lo da. */
  activeCount: number | null
}

export interface MarketSource {
  readonly venue: VenueId
  readonly chainId: number
  readonly capabilities: VenueCapabilities
  /** Nombre para mostrar. Lo único del venue que la UI puede enseñar. */
  readonly displayName: string

  listMarkets(filter: MarketFilter): Promise<Result<MarketPage>>
  getMarket(id: string): Promise<Result<Market | null>>

  /**
   * Subcategorías con actividad dentro de `category` (p. ej. los deportes de
   * 'sports'). Si el venue no lo soporta (`canListSubcategories: false`),
   * devuelve `unsupported`; si la categoría no le aplica, lista vacía.
   */
  listSubcategories(category: MarketCategory): Promise<Result<Subcategory[]>>

  getQuote(
    marketId: string,
    outcomeId: string,
    stake: DecimalString,
  ): Promise<Result<Quote>>

  placeBet(quote: Quote, opts: BetOptions): Promise<Result<BetReceipt>>
  getPositions(address: string): Promise<Result<Position[]>>

  /**
   * Cobra una posición 'redeemable' (premio de una ganada o devolución de una
   * cancelada). Firma una transacción on-chain con la wallet. Si el venue no
   * lo soporta (`canRedeem: false`), devuelve `unsupported`.
   */
  redeemPosition(
    position: Position,
    opts: { from: string },
  ): Promise<Result<RedeemReceipt>>

  /** Suscripción en vivo. Devuelve la función de baja. */
  subscribe?(marketIds: string[], cb: (m: Market) => void): () => void
}

// ---------------------------------------------------------------------------
// Ayudas de dominio
// ---------------------------------------------------------------------------

/**
 * ¿Debe listarse este mercado por defecto?
 *
 * Centraliza la regla en un solo sitio para que ni la UI ni un adaptador la
 * reimplementen a su manera. Los adaptadores la aplican antes de devolver.
 */
export function isListable(
  market: Market,
  filter: Pick<
    MarketFilter,
    'includeClosed' | 'includeNonQuotable' | 'subcategory'
  > = {},
): boolean {
  // Filtro por subcategoría también aquí: aunque un venue filtre en servidor,
  // hay rutas (la búsqueda de Azuro, por ejemplo) que no lo permiten.
  if (
    filter.subcategory !== undefined &&
    market.subcategory !== filter.subcategory
  ) {
    return false
  }
  if (!filter.includeClosed) {
    if (market.status !== 'open') return false
    if (market.closesAt !== null && market.closesAt.getTime() <= Date.now()) {
      return false
    }
  }
  if (!filter.includeNonQuotable && !market.isQuotable) return false
  return true
}

/**
 * Convierte precio nativo a probabilidad 0..1.
 *
 * Devuelve `null` cuando no hay precio o el valor es absurdo, para que un dato
 * corrupto del venue no se convierta en una probabilidad plausible.
 */
export function priceToProbability(
  price: DecimalString | null,
  format: PriceFormat,
): number | null {
  if (price === null) return null
  const n = Number(price)
  if (!Number.isFinite(n)) return null

  if (format === 'decimal-odds') {
    // Una cuota decimal por debajo de 1 no tiene sentido: pagaría menos de lo
    // apostado.
    if (n <= 1) return null
    return 1 / n
  }

  if (n <= 0 || n >= 1) return null
  return n
}

/** Construye el id de dominio. Único punto donde se decide el formato. */
export function makeMarketId(venue: VenueId, nativeId: string): string {
  return `${venue}:${nativeId}`
}

/** Descompone un id de dominio. `null` si no tiene la forma esperada. */
export function parseMarketId(
  id: string,
): { venue: VenueId; nativeId: string } | null {
  const idx = id.indexOf(':')
  if (idx <= 0 || idx === id.length - 1) return null
  return { venue: id.slice(0, idx), nativeId: id.slice(idx + 1) }
}
