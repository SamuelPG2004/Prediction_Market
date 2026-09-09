/**
 * BOT TIPSTER: evalúa el catálogo actual de Azuro con Gemini, actuando bajo
 * el método de un tipster concreto (sus transcripciones se inyectan en el
 * system prompt desde api/_tipster/transcripciones.ts), y devuelve picks
 * listos para la dApp. El núcleo compartido con el chat de pronósticos vive
 * en api/_tipster/nucleo.ts.
 *
 * GET /api/tipster-bot → { generatedAt, picks: [...], aviso }
 * GET /api/tipster-bot?gameIds=a,b,c → igual, pero evaluando SOLO esos
 *   partidos (los que el usuario eligió en la dApp; máximo 15).
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
 *    machacar la API de Azuro. Si una pasada falla (cuota de Gemini, Azuro
 *    caído), se sirve la última respuesta buena aunque haya caducado — mejor
 *    picks algo viejos que una sección que desaparece.
 *
 * Entorno (en Vercel, sin prefijo VITE_: jamás llegan al navegador):
 *  - GEMINI_API_KEY        obligatoria; sin ella el endpoint responde 503.
 *                          Gratis en https://aistudio.google.com/apikey
 *  - TIPSTER_BOT_MODEL     opcional; por defecto "gemini-3.6-flash".
 *  - TIPSTER_BOT_SPORT     opcional; slug de deporte de Azuro ("football")
 *                          para acotar el catálogo al terreno del tipster.
 *  - TIPSTER_BOT_TTL_MIN   opcional; minutos de caché (por defecto 15).
 */
// OJO extensión .js: el proyecto es "type": "module" y el runtime ESM de
// Vercel exige extensión en los imports relativos (sin ella la función casca
// al invocarse con FUNCTION_INVOCATION_FAILED, verificado 2026-09-06).
import {
  AVISO,
  DEFAULT_MODEL,
  GAMES_TO_EVALUATE,
  PICKS_SCHEMA_FRAGMENT,
  buildCatalog,
  buildSystemPrompt,
  fetchGamesByIds,
  fetchTopGames,
  llamarGemini,
  parseGeminiPicks,
  readEnv,
  sendJson,
  validatePicks,
  type VercelRequest,
  type VercelResponse,
} from './_tipster/nucleo.js'

const DEFAULT_TTL_MIN = 15

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: { picks: PICKS_SCHEMA_FRAGMENT },
  required: ['picks'],
} as const

/**
 * Caché por instancia de la función, con TTL, para el tier gratuito de
 * Gemini: una entrada por conjunto pedido ('auto' o los gameIds elegidos),
 * con un tope de entradas para que las selecciones personalizadas no crezcan
 * sin límite.
 */
const cache = new Map<string, { at: number; payload: unknown }>()
const CACHE_MAX_ENTRIES = 8

/** gameIds del query string, validados; null = modo automático. */
function parseRequestedGameIds(url: string | undefined): string[] | null {
  const query = url?.split('?')[1]
  if (query === undefined) return null
  const raw = new URLSearchParams(query).get('gameIds')
  if (raw === null || raw.trim() === '') return null
  const ids = [...new Set(raw.split(','))]
    .map((id) => id.trim())
    .filter((id) => /^\d{10,30}$/.test(id))
  return ids.length > 0 ? ids.slice(0, GAMES_TO_EVALUATE) : null
}

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

  const requestedIds = parseRequestedGameIds(req.url)
  const cacheKey = requestedIds === null ? 'auto' : [...requestedIds].sort().join(',')

  const ttlMin = Number(readEnv('TIPSTER_BOT_TTL_MIN') ?? DEFAULT_TTL_MIN)
  const ttlMs = (Number.isFinite(ttlMin) && ttlMin > 0 ? ttlMin : DEFAULT_TTL_MIN) * 60_000
  const cached = cache.get(cacheKey)
  if (cached !== undefined && Date.now() - cached.at < ttlMs) {
    sendJson(res, 200, cached.payload)
    return
  }

  try {
    const rawGames =
      requestedIds !== null
        ? await fetchGamesByIds(requestedIds)
        : await fetchTopGames(readEnv('TIPSTER_BOT_SPORT'))
    const catalog = await buildCatalog(rawGames)
    const model = readEnv('TIPSTER_BOT_MODEL') ?? DEFAULT_MODEL
    const base = {
      modo: requestedIds !== null ? 'personalizado' : 'auto',
      modelo: model,
      aviso: AVISO,
    }
    if (catalog.length === 0) {
      sendJson(res, 200, {
        ...base,
        generatedAt: new Date().toISOString(),
        partidosEvaluados: 0,
        picks: [],
        descartadosPorInvalidos: 0,
      })
      return
    }

    const parsed = await llamarGemini({
      apiKey,
      model,
      systemPrompt,
      userText:
        'Catálogo actual de Azuro (partidos prematch más apostados, con sus mercados activos y cuotas decimales). Evalúalo con el método del tipster y responde el JSON pedido:\n' +
        JSON.stringify(catalog),
      schema: RESPONSE_SCHEMA,
    })
    const rawPicks = parseGeminiPicks(parsed)
    const { validos, descartados } = validatePicks(rawPicks, catalog)

    const payload = {
      ...base,
      generatedAt: new Date().toISOString(),
      partidosEvaluados: catalog.length,
      picks: validos,
      // Picks que el modelo inventó (ids inexistentes) o repitió: descartados.
      descartadosPorInvalidos: descartados,
    }
    cache.set(cacheKey, { at: Date.now(), payload })
    // Tope de entradas: fuera la más vieja (el iterador del Map va por orden
    // de inserción).
    if (cache.size > CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    sendJson(res, 200, payload)
  } catch (error) {
    // Pasada fallida con caché rancia disponible: mejor servirla (renovando su
    // reloj para no martillear a Gemini en cada carga) que esconder la sección.
    if (cached !== undefined) {
      cache.set(cacheKey, { at: Date.now(), payload: cached.payload })
      sendJson(res, 200, cached.payload)
      return
    }
    sendJson(res, 502, {
      error: 'El bot no pudo completar la pasada.',
      detalle: error instanceof Error ? error.message : String(error),
    })
  }
}
