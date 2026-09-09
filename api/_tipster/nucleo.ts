/**
 * NÚCLEO COMPARTIDO del bot tipster: todo lo que usan tanto la pasada de
 * picks (api/tipster-bot.ts) como el chat de pronósticos (api/tipster-chat.ts):
 * catálogo de Azuro, perfil del tipster para el system prompt, llamada a
 * Gemini con esquema forzado y validación de picks contra el catálogo real.
 *
 * La carpeta empieza por "_": Vercel no la expone como ruta.
 */
import { getMarketName, getSelectionName } from '@azuro-org/dictionaries'
// OJO extensión .js: el proyecto es "type": "module" y el runtime ESM de
// Vercel exige extensión en los imports relativos (sin ella la función casca
// al invocarse con FUNCTION_INVOCATION_FAILED, verificado 2026-09-06).
import {
  MARCADOR_PENDIENTE,
  REGLAS_EXTRA,
  TRANSCRIPCIONES,
} from './transcripciones.js'

export const AZURO_API = 'https://api.onchainfeed.org/api/v1/public'
export const AZURO_ENVIRONMENT = 'PolygonUSDT'
/** Juegos que se evalúan por pasada: los más apostados primero. */
export const GAMES_TO_EVALUATE = 15
/** Mercados por partido que se enseñan al modelo (los primeros del feed). */
export const MAX_MARKETS_PER_GAME = 10
// gemini-2.5-flash ya no existe para cuentas nuevas (404 verificado
// 2026-09-07): Google redirige a esta generación.
export const DEFAULT_MODEL = 'gemini-3.6-flash'

export const AVISO =
  'Picks generados por una IA imitando las reglas públicas de un tipster, solo con equipos, ligas y cuotas como datos. Sin validación estadística: NO son consejo financiero ni garantizan nada. Apostar es decisión (y firma) tuya.'

// --- Firma (req, res) del runtime Node de Vercel, como en gas-station.ts ---

export interface VercelRequest {
  method?: string
  /** Ruta con query string, p. ej. "/api/tipster-bot?gameIds=1,2". */
  url?: string
  headers?: Record<string, string | string[] | undefined>
  /** Puesto por los helpers de Vercel: objeto si era JSON, string si texto. */
  body?: unknown
}
export interface VercelResponse {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): void
  send(body: string): void
}

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('content-type', 'application/json')
  res.status(status).send(JSON.stringify(body))
}

export function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null
}

// --- Catálogo de Azuro -------------------------------------------------------

export interface CatalogOutcome {
  outcomeId: string
  nombre: string
  cuota: number
}

export interface CatalogMarket {
  conditionId: string
  mercado: string
  resultados: CatalogOutcome[]
}

export interface CatalogGame {
  gameId: string
  partido: string
  deporte: string
  liga: string
  pais: string | null
  comienzaEnHoras: number
  mercados: CatalogMarket[]
}

function selectionNameOf(outcomeId: string): string {
  try {
    return getSelectionName({ outcomeId, withPoint: true })
  } catch {
    return `Resultado ${outcomeId}`
  }
}

function marketNameOf(outcomeId: string, title: unknown): string {
  if (typeof title === 'string' && title.trim() !== '') return title
  try {
    return getMarketName({ outcomeId })
  } catch {
    return 'Mercado'
  }
}

/** Juegos prematch más apostados (el modo automático del bot). */
export async function fetchTopGames(sportSlug: string | undefined): Promise<unknown[]> {
  const params = new URLSearchParams({
    environment: AZURO_ENVIRONMENT,
    gameState: 'Prematch',
    orderBy: 'turnover',
    orderDirection: 'desc',
    perPage: String(GAMES_TO_EVALUATE),
    page: '1',
  })
  if (sportSlug !== undefined) params.set('sportSlug', sportSlug)
  const res = await fetch(`${AZURO_API}/market-manager/games-by-filters?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Azuro games-by-filters: ${res.status}`)
  const body: unknown = await res.json()
  if (!isRecord(body) || !Array.isArray(body.games)) {
    throw new Error('Azuro games-by-filters: respuesta inesperada')
  }
  return body.games
}

/** Los juegos concretos que eligió el usuario en la dApp. */
export async function fetchGamesByIds(gameIds: string[]): Promise<unknown[]> {
  const res = await fetch(`${AZURO_API}/market-manager/games-by-ids`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameIds }),
  })
  if (!res.ok) throw new Error(`Azuro games-by-ids: ${res.status}`)
  const body: unknown = await res.json()
  if (!isRecord(body) || !Array.isArray(body.games)) {
    throw new Error('Azuro games-by-ids: respuesta inesperada')
  }
  return body.games
}

/**
 * Reduce los juegos crudos + sus mercados activos a lo que el modelo necesita
 * leer. Todo lo externo se valida campo a campo: un elemento malformado se
 * descarta sin tirar la pasada.
 */
export async function buildCatalog(rawGames: unknown[]): Promise<CatalogGame[]> {
  const games = new Map<string, CatalogGame>()
  const now = Date.now()
  for (const raw of rawGames) {
    if (!isRecord(raw) || typeof raw.gameId !== 'string' || typeof raw.title !== 'string') continue
    const startsAtMs = Number(raw.startsAt) * 1000
    if (!Number.isFinite(startsAtMs)) continue
    const sport = isRecord(raw.sport) && typeof raw.sport.name === 'string' ? raw.sport.name : 'desconocido'
    const league = isRecord(raw.league) && typeof raw.league.name === 'string' ? raw.league.name : 'desconocida'
    const country = isRecord(raw.country) && typeof raw.country.name === 'string' ? raw.country.name : null
    games.set(raw.gameId, {
      gameId: raw.gameId,
      partido: raw.title,
      deporte: sport,
      liga: league,
      pais: country,
      comienzaEnHoras: Math.round(((startsAtMs - now) / 3_600_000) * 10) / 10,
      mercados: [],
    })
  }
  if (games.size === 0) return []

  const conditionsRes = await fetch(`${AZURO_API}/market-manager/conditions-by-game-ids`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameIds: [...games.keys()], environment: AZURO_ENVIRONMENT }),
  })
  if (!conditionsRes.ok) throw new Error(`Azuro conditions-by-game-ids: ${conditionsRes.status}`)
  const conditionsBody: unknown = await conditionsRes.json()
  const conditions = isRecord(conditionsBody) ? conditionsBody.conditions : null
  if (!Array.isArray(conditions)) {
    throw new Error('Azuro conditions-by-game-ids: respuesta inesperada')
  }

  for (const raw of conditions) {
    if (!isRecord(raw) || typeof raw.conditionId !== 'string') continue
    if (raw.state !== 'Active' || raw.hidden === true) continue
    if (!isRecord(raw.game) || typeof raw.game.gameId !== 'string') continue
    const game = games.get(raw.game.gameId)
    if (game === undefined || game.mercados.length >= MAX_MARKETS_PER_GAME) continue
    if (!Array.isArray(raw.outcomes)) continue

    const resultados: CatalogOutcome[] = []
    for (const o of raw.outcomes) {
      if (!isRecord(o) || typeof o.outcomeId !== 'string') continue
      if (o.hidden === true) continue
      const cuota = Number(o.odds)
      if (!Number.isFinite(cuota) || cuota <= 1) continue
      resultados.push({
        outcomeId: o.outcomeId,
        nombre: typeof o.title === 'string' && o.title.trim() !== ''
          ? o.title
          : selectionNameOf(o.outcomeId),
        cuota: Math.round(cuota * 100) / 100,
      })
    }
    if (resultados.length === 0) continue

    game.mercados.push({
      conditionId: raw.conditionId,
      mercado: marketNameOf(resultados[0]!.outcomeId, raw.title),
      resultados,
    })
  }

  return [...games.values()].filter((g) => g.mercados.length > 0)
}

// --- Perfil del tipster (system prompt) ---------------------------------------

/** Perfil del tipster para el system prompt, o `null` si falta pegar las transcripciones. */
export function buildSystemPrompt(): string | null {
  const listas = TRANSCRIPCIONES.filter(
    (t) => t.transcripcion.trim() !== '' && !t.transcripcion.includes(MARCADOR_PENDIENTE),
  )
  if (listas.length === 0) return null

  const transcripciones = listas
    .map((t, i) => `### Video ${i + 1}: "${t.titulo}"\n${t.transcripcion.trim()}`)
    .join('\n\n')
  const extra = REGLAS_EXTRA.length > 0
    ? `\n\nReglas adicionales del operador (tienen prioridad sobre los videos):\n${REGLAS_EXTRA.map((r) => `- ${r}`).join('\n')}`
    : ''

  return [
    'Eres un analista de apuestas deportivas que aplica ESTRICTAMENTE el método de un tipster concreto.',
    'Su método completo está en las transcripciones de sus videos, más abajo. Primero extrae de ellas sus reglas operativas (qué mercados mira, qué condiciones exige, qué evita, cómo dimensiona el stake) y luego evalúa SOLO con esas reglas los partidos que se te dan.',
    '',
    'Reglas duras tuyas, por encima de todo:',
    '- Solo puedes elegir entre los partidos, mercados y resultados del catálogo que recibes, citando sus gameId, conditionId y outcomeId EXACTOS. Jamás inventes ids ni mercados.',
    '- Si ningún candidato cumple las reglas del tipster, devuelve la lista de picks VACÍA. No fuerces picks: no elegir también es aplicar el método.',
    '- El catálogo solo trae equipos, ligas y cuotas (y, si se aportan, datos de forma reciente). Si una regla del tipster necesita datos que no tienes (lesiones, alineaciones), NO des por cumplida esa regla: o descarta el pick o baja la confianza y dilo en la razón.',
    '- Máximo 5 picks por pasada. stakeUnits entre 1 y 3 (según la escala del tipster). confianza entre 0 y 1.',
    '- En "regla" cita textualmente qué regla del tipster sustenta el pick; en "razon", por qué este partido la cumple, en 1-3 frases y en español.',
    '',
    '## Transcripciones del tipster',
    transcripciones,
    extra,
  ].join('\n')
}

// --- Gemini ------------------------------------------------------------------

export interface GeminiPick {
  gameId: string
  conditionId: string
  outcomeId: string
  stakeUnits: number
  confianza: number
  regla: string
  razon: string
}

/** Fragmento de esquema de un pick, para componer los esquemas de respuesta. */
export const PICKS_SCHEMA_FRAGMENT = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      gameId: { type: 'STRING' },
      conditionId: { type: 'STRING' },
      outcomeId: { type: 'STRING' },
      stakeUnits: { type: 'NUMBER' },
      confianza: { type: 'NUMBER' },
      regla: { type: 'STRING' },
      razon: { type: 'STRING' },
    },
    required: ['gameId', 'conditionId', 'outcomeId', 'stakeUnits', 'confianza', 'regla', 'razon'],
  },
} as const

/**
 * Llama a Gemini con esquema JSON forzado y devuelve el JSON ya parseado.
 * Lanza con detalle acotado si la API falla o no responde JSON.
 *
 * El tier gratuito devuelve 503 "high demand" transitorios con frecuencia
 * (verificado 2026-09-07): un único reintento con pausa corta resuelve la
 * mayoría sin comerse el presupuesto de la función.
 */
export async function llamarGemini(opts: {
  apiKey: string
  model: string
  systemPrompt: string
  userText: string
  schema: unknown
  temperature?: number
  maxOutputTokens?: number
}): Promise<unknown> {
  let response: Response
  for (let intento = 0; ; intento++) {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: opts.userText }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.2,
            // Techo holgado: los modelos con razonamiento gastan parte del
            // presupuesto "pensando" y un techo justo corta el JSON a medias.
            maxOutputTokens: opts.maxOutputTokens ?? 8192,
            responseMimeType: 'application/json',
            responseSchema: opts.schema,
          },
        }),
      },
    )
    if (response.status === 503 && intento === 0) {
      await new Promise((r) => setTimeout(r, 2000))
      continue
    }
    break
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Gemini ${response.status}: ${detail.slice(0, 300)}`)
  }

  const body: unknown = await response.json()
  // Forma de la respuesta: candidates[0].content.parts[0].text = el JSON pedido.
  const candidates = isRecord(body) && Array.isArray(body.candidates) ? body.candidates : []
  const first = candidates[0]
  const parts =
    isRecord(first) && isRecord(first.content) && Array.isArray(first.content.parts)
      ? first.content.parts
      : []
  const text = parts
    .map((p: unknown) => (isRecord(p) && typeof p.text === 'string' ? p.text : ''))
    .join('')
  if (text === '') throw new Error('Gemini no devolvió texto (¿bloqueo de seguridad o cuota agotada?)')

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Gemini no devolvió JSON válido pese al esquema')
  }
}

/** Extrae y sanea los picks de una respuesta ya parseada de Gemini. */
export function parseGeminiPicks(parsed: unknown): GeminiPick[] {
  const rawPicks = isRecord(parsed) && Array.isArray(parsed.picks) ? parsed.picks : []
  const picks: GeminiPick[] = []
  for (const p of rawPicks) {
    if (!isRecord(p)) continue
    if (
      typeof p.gameId !== 'string' ||
      typeof p.conditionId !== 'string' ||
      typeof p.outcomeId !== 'string' ||
      typeof p.regla !== 'string' ||
      typeof p.razon !== 'string'
    ) {
      continue
    }
    const stakeUnits = Number(p.stakeUnits)
    const confianza = Number(p.confianza)
    if (!Number.isFinite(stakeUnits) || !Number.isFinite(confianza)) continue
    picks.push({
      gameId: p.gameId,
      conditionId: p.conditionId,
      outcomeId: p.outcomeId,
      stakeUnits: Math.min(3, Math.max(1, Math.round(stakeUnits))),
      confianza: Math.min(1, Math.max(0, confianza)),
      regla: p.regla,
      razon: p.razon,
    })
  }
  return picks
}

// --- Validación contra el catálogo real ---------------------------------------

/** Pick ya verificado y enriquecido con los datos REALES de Azuro. */
export interface ValidatedPick extends GeminiPick {
  partido: string
  liga: string
  deporte: string
  comienzaEnHoras: number
  mercado: string
  resultado: string
  /** Cuota actual según Azuro (la del modelo se ignora siempre). */
  cuota: number
  /** Para abrir el mercado en la dApp: `azuro:${gameId}/${conditionId}`. */
  marketId: string
}

export function validatePicks(picks: GeminiPick[], catalog: CatalogGame[]): {
  validos: ValidatedPick[]
  descartados: number
} {
  const gamesById = new Map(catalog.map((g) => [g.gameId, g]))
  const validos: ValidatedPick[] = []
  let descartados = 0
  const vistos = new Set<string>()

  for (const pick of picks.slice(0, 5)) {
    const game = gamesById.get(pick.gameId)
    const market = game?.mercados.find((m) => m.conditionId === pick.conditionId)
    const outcome = market?.resultados.find((o) => o.outcomeId === pick.outcomeId)
    const key = `${pick.conditionId}/${pick.outcomeId}`
    if (game === undefined || market === undefined || outcome === undefined || vistos.has(key)) {
      descartados += 1
      continue
    }
    vistos.add(key)
    validos.push({
      ...pick,
      partido: game.partido,
      liga: game.liga,
      deporte: game.deporte,
      comienzaEnHoras: game.comienzaEnHoras,
      mercado: market.mercado,
      resultado: outcome.nombre,
      cuota: outcome.cuota,
      marketId: `azuro:${game.gameId}/${market.conditionId}`,
    })
  }
  return { validos, descartados }
}
