/**
 * BOT TIPSTER: evalúa el catálogo actual de Azuro con Gemini, actuando bajo
 * el método de un tipster concreto (sus transcripciones se inyectan en el
 * system prompt desde api/_tipster/transcripciones.ts), y devuelve picks
 * listos para la dApp.
 *
 * GET /api/tipster-bot → { generatedAt, picks: [...], aviso }
 *
 * Diseño (dinero real, así que con red de seguridad):
 *  - El bot NUNCA apuesta: solo propone. Apostar sigue siendo un acto humano
 *    con firma de wallet.
 *  - Anti-alucinación: Gemini responde JSON con esquema forzado, y aun así
 *    cada pick se valida contra el catálogo real — un conditionId/outcomeId
 *    que no exista se descarta y se cuenta. La cuota que se muestra es la de
 *    la API de Azuro, jamás la que diga el modelo.
 *  - "Sin pick" es una respuesta válida: el prompt ordena devolver lista
 *    vacía si nada cumple las reglas del tipster, en vez de forzar picks.
 *  - Caché en memoria (TTL) para respetar el tier gratuito de Gemini y no
 *    machacar la API de Azuro.
 *
 * Entorno (en Vercel, sin prefijo VITE_: jamás llegan al navegador):
 *  - GEMINI_API_KEY        obligatoria; sin ella el endpoint responde 503.
 *                          Gratis en https://aistudio.google.com/apikey
 *  - TIPSTER_BOT_MODEL     opcional; por defecto "gemini-3.6-flash".
 *  - TIPSTER_BOT_SPORT     opcional; slug de deporte de Azuro ("football")
 *                          para acotar el catálogo al terreno del tipster.
 *  - TIPSTER_BOT_TTL_MIN   opcional; minutos de caché (por defecto 15).
 */
import { getMarketName, getSelectionName } from '@azuro-org/dictionaries'
// OJO extensión .js: el proyecto es "type": "module" y el runtime ESM de
// Vercel exige extensión en los imports relativos (sin ella la función casca
// al invocarse con FUNCTION_INVOCATION_FAILED, verificado 2026-09-06).
import {
  MARCADOR_PENDIENTE,
  REGLAS_EXTRA,
  TRANSCRIPCIONES,
} from './_tipster/transcripciones.js'

const AZURO_API = 'https://api.onchainfeed.org/api/v1/public'
const AZURO_ENVIRONMENT = 'PolygonUSDT'
/** Juegos que se evalúan por pasada: los más apostados primero. */
const GAMES_TO_EVALUATE = 15
/** Mercados por partido que se enseñan al modelo (los primeros del feed). */
const MAX_MARKETS_PER_GAME = 10
// gemini-2.5-flash ya no existe para cuentas nuevas (404 verificado
// 2026-09-07): Google redirige a esta generación.
const DEFAULT_MODEL = 'gemini-3.6-flash'
const DEFAULT_TTL_MIN = 15

// --- Firma (req, res) del runtime Node de Vercel, como en gas-station.ts ---

interface VercelRequest {
  method?: string
}
interface VercelResponse {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): void
  send(body: string): void
}

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('content-type', 'application/json')
  res.status(status).send(JSON.stringify(body))
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

// --- Catálogo de Azuro -------------------------------------------------------

interface CatalogOutcome {
  outcomeId: string
  nombre: string
  cuota: number
}

interface CatalogMarket {
  conditionId: string
  mercado: string
  resultados: CatalogOutcome[]
}

interface CatalogGame {
  gameId: string
  partido: string
  deporte: string
  liga: string
  pais: string | null
  comienzaEnHoras: number
  mercados: CatalogMarket[]
}

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null
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

/**
 * Trae los juegos prematch más apostados y sus mercados activos, ya reducidos
 * a lo que el modelo necesita leer. Todo lo externo se valida campo a campo:
 * un elemento malformado se descarta sin tirar la pasada.
 */
async function fetchAzuroCatalog(sportSlug: string | undefined): Promise<CatalogGame[]> {
  const params = new URLSearchParams({
    environment: AZURO_ENVIRONMENT,
    gameState: 'Prematch',
    orderBy: 'turnover',
    orderDirection: 'desc',
    perPage: String(GAMES_TO_EVALUATE),
    page: '1',
  })
  if (sportSlug !== undefined) params.set('sportSlug', sportSlug)

  const gamesRes = await fetch(`${AZURO_API}/market-manager/games-by-filters?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!gamesRes.ok) throw new Error(`Azuro games-by-filters: ${gamesRes.status}`)
  const gamesBody: unknown = await gamesRes.json()
  if (!isRecord(gamesBody) || !Array.isArray(gamesBody.games)) {
    throw new Error('Azuro games-by-filters: respuesta inesperada')
  }

  const games = new Map<string, CatalogGame>()
  const now = Date.now()
  for (const raw of gamesBody.games) {
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

// --- Gemini ------------------------------------------------------------------

/** Perfil del tipster para el system prompt, o `null` si falta pegar las transcripciones. */
function buildSystemPrompt(): string | null {
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
    '- El catálogo solo trae equipos, ligas y cuotas. Si una regla del tipster necesita datos que no tienes (lesiones, forma, alineaciones), NO des por cumplida esa regla: o descarta el pick o baja la confianza y dilo en la razón.',
    '- Máximo 5 picks por pasada. stakeUnits entre 1 y 3 (según la escala del tipster). confianza entre 0 y 1.',
    '- En "regla" cita textualmente qué regla del tipster sustenta el pick; en "razon", por qué este partido la cumple, en 1-3 frases y en español.',
    '',
    '## Transcripciones del tipster',
    transcripciones,
    extra,
  ].join('\n')
}

interface GeminiPick {
  gameId: string
  conditionId: string
  outcomeId: string
  stakeUnits: number
  confianza: number
  regla: string
  razon: string
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    picks: {
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
    },
  },
  required: ['picks'],
} as const

async function askGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  catalog: CatalogGame[],
): Promise<GeminiPick[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'Catálogo actual de Azuro (partidos prematch más apostados, con sus mercados activos y cuotas decimales). Evalúalo con el método del tipster y responde el JSON pedido:\n' +
                  JSON.stringify(catalog),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  )
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

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Gemini no devolvió JSON válido pese al esquema')
  }
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
interface ValidatedPick extends GeminiPick {
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

function validatePicks(picks: GeminiPick[], catalog: CatalogGame[]): {
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

// --- Handler -------------------------------------------------------------------

const AVISO =
  'Picks generados por una IA imitando las reglas públicas de un tipster, solo con equipos, ligas y cuotas como datos. Sin validación estadística: NO son consejo financiero ni garantizan nada. Apostar es decisión (y firma) tuya.'

/** Caché por instancia de la función: TTL para el tier gratuito de Gemini. */
let cache: { at: number; payload: unknown } | null = null

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Método no soportado' })
    return
  }

  const apiKey = readEnv('GEMINI_API_KEY')
  if (apiKey === undefined) {
    sendJson(res, 503, {
      enabled: false,
      motivo: 'Falta GEMINI_API_KEY en el entorno de Vercel (gratis en aistudio.google.com/apikey).',
    })
    return
  }
  const systemPrompt = buildSystemPrompt()
  if (systemPrompt === null) {
    sendJson(res, 503, {
      enabled: false,
      motivo: 'Faltan las transcripciones del tipster: pégalas en api/_tipster/transcripciones.ts.',
    })
    return
  }

  const ttlMin = Number(readEnv('TIPSTER_BOT_TTL_MIN') ?? DEFAULT_TTL_MIN)
  const ttlMs = (Number.isFinite(ttlMin) && ttlMin > 0 ? ttlMin : DEFAULT_TTL_MIN) * 60_000
  if (cache !== null && Date.now() - cache.at < ttlMs) {
    sendJson(res, 200, cache.payload)
    return
  }

  try {
    const catalog = await fetchAzuroCatalog(readEnv('TIPSTER_BOT_SPORT'))
    if (catalog.length === 0) {
      sendJson(res, 200, {
        generatedAt: new Date().toISOString(),
        partidosEvaluados: 0,
        picks: [],
        aviso: AVISO,
      })
      return
    }

    const model = readEnv('TIPSTER_BOT_MODEL') ?? DEFAULT_MODEL
    const rawPicks = await askGemini(apiKey, model, systemPrompt, catalog)
    const { validos, descartados } = validatePicks(rawPicks, catalog)

    const payload = {
      generatedAt: new Date().toISOString(),
      modelo: model,
      partidosEvaluados: catalog.length,
      picks: validos,
      // Picks que el modelo inventó (ids inexistentes) o repitió: descartados.
      descartadosPorInvalidos: descartados,
      aviso: AVISO,
    }
    cache = { at: Date.now(), payload }
    sendJson(res, 200, payload)
  } catch (error) {
    sendJson(res, 502, {
      error: 'El bot no pudo completar la pasada.',
      detalle: error instanceof Error ? error.message : String(error),
    })
  }
}
