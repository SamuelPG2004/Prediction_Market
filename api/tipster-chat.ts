/**
 * CHAT DEL TIPSTER: el usuario elige UN partido cualquiera del sportsbook
 * (no solo los populares), pregunta lo que quiera y el bot responde con un
 * pronóstico razonado usando el método del tipster (transcripciones), las
 * cuotas reales de Azuro y la forma reciente de los equipos raspada de
 * fuentes públicas (api/_tipster/futbol.ts).
 *
 * POST /api/tipster-chat  { gameId: string, pregunta?: string }
 *   → 200 { respuesta, picks: [...], forma, restantes, aviso }
 *   → 429 { motivo, reintentarEnSegundos }  si se agotó el cupo (tier
 *          gratuito de Gemini; ver api/_tipster/limites.ts)
 *
 * POST /api/tipster-chat  { gameId, soloCache: true }
 *   → 200 con el pronóstico ya calculado de ese partido, o { enCache: false }
 *   NUNCA llama a Gemini ni gasta cupo: es la sonda que usa el panel de
 *   apuesta para enseñar el consejo gratis si otro usuario (o este) ya lo
 *   pidió hace poco.
 *
 * Mismas redes de seguridad que /api/tipster-bot: el bot nunca apuesta, los
 * picks se validan contra el catálogo real y la cuota mostrada es la de
 * Azuro. La respuesta de texto es opinión de una IA, no consejo financiero.
 */
// OJO extensión .js: el proyecto es "type": "module" y el runtime ESM de
// Vercel exige extensión en los imports relativos (sin ella la función casca
// al invocarse con FUNCTION_INVOCATION_FAILED, verificado 2026-09-06).
import {
  AVISO,
  DEFAULT_MODEL,
  PICKS_SCHEMA_FRAGMENT,
  buildCatalog,
  buildSystemPrompt,
  fetchGamesByIds,
  isRecord,
  llamarGemini,
  parseGeminiPicks,
  readEnv,
  sendJson,
  validatePicks,
  type VercelRequest,
  type VercelResponse,
} from './_tipster/nucleo.js'
import { formaDeEquipo, formaParaPrompt, type FormaEquipo } from './_tipster/futbol.js'
import { consumirTurno } from './_tipster/limites.js'

/** La pregunta del usuario se acota: esto es un chat, no un ensayo. */
const MAX_PREGUNTA = 300

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    respuesta: { type: 'STRING' },
    picks: PICKS_SCHEMA_FRAGMENT,
  },
  required: ['respuesta', 'picks'],
} as const

/**
 * Caché por (partido, pregunta). El pronóstico GENERAL (sin pregunta) dura
 * 1 h: es lo que comparten todos los que abren el mismo partido, y una cuota
 * algo rancia se tolera porque el pick preseleccionado muestra la cuota real
 * del panel al usarlo. Las preguntas libres duran 10 min (amortiguan dobles
 * clics sin fosilizar una conversación).
 */
const cache = new Map<string, { at: number; payload: unknown }>()
const CACHE_TTL_PREGUNTA_MS = 10 * 60_000
const CACHE_TTL_GENERAL_MS = 60 * 60_000
const CACHE_MAX_ENTRIES = 60

function ipDe(req: VercelRequest): string {
  const raw = req.headers?.['x-forwarded-for']
  const first = Array.isArray(raw) ? raw[0] : raw
  return typeof first === 'string' && first !== '' ? first.split(',')[0]!.trim() : 'desconocida'
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Método no soportado' })
    return
  }

  const apiKey = readEnv('GEMINI_API_KEY')
  const systemPrompt = buildSystemPrompt()
  if (apiKey === undefined || systemPrompt === null) {
    sendJson(res, 503, { enabled: false, motivo: 'El bot tipster no está configurado.' })
    return
  }

  // Cuerpo: gameId obligatorio (formato de id nativo de Azuro), pregunta opcional.
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body
  if (!isRecord(body) || typeof body.gameId !== 'string' || !/^\d{10,30}$/.test(body.gameId)) {
    sendJson(res, 400, { error: 'Falta gameId válido' })
    return
  }
  const gameId = body.gameId
  const pregunta =
    typeof body.pregunta === 'string' && body.pregunta.trim() !== ''
      ? body.pregunta.trim().slice(0, MAX_PREGUNTA)
      : null

  // Caché antes que límite: responder lo ya calculado no gasta cupo de nadie.
  const cacheKey = `${gameId}|${pregunta ?? ''}`
  const ttlMs = pregunta === null ? CACHE_TTL_GENERAL_MS : CACHE_TTL_PREGUNTA_MS
  const cached = cache.get(cacheKey)
  if (cached !== undefined && Date.now() - cached.at < ttlMs) {
    sendJson(res, 200, cached.payload)
    return
  }

  // Sonda del panel: solo mira la caché, jamás genera. Sin acierto responde
  // { enCache: false } y el frontend deja el botón de pedirlo a mano.
  if (body.soloCache === true) {
    sendJson(res, 200, { enCache: false })
    return
  }

  const turno = consumirTurno(ipDe(req))
  if (!turno.ok) {
    sendJson(res, 429, {
      motivo: turno.motivo,
      reintentarEnSegundos: turno.reintentarEnSegundos,
    })
    return
  }

  try {
    const catalog = await buildCatalog(await fetchGamesByIds([gameId]))
    const game = catalog[0]
    if (game === undefined) {
      sendJson(res, 404, {
        error: 'Ese partido ya no tiene mercados activos en Azuro (¿empezó o se cerró?).',
      })
      return
    }

    // Forma reciente de ambos equipos, solo en fútbol (la fuente cubre eso).
    // El título de Azuro es "Local - Visitante"; si no casa, se opera sin datos.
    let bloqueForma: string | null = null
    let formas: { nombreAzuro: string; forma: FormaEquipo | null }[] = []
    if (game.deporte === 'Football') {
      const equipos = game.partido.split(' - ').map((n) => n.trim()).filter((n) => n !== '')
      if (equipos.length === 2) {
        formas = await Promise.all(
          equipos.map(async (nombreAzuro) => ({
            nombreAzuro,
            forma: await formaDeEquipo(nombreAzuro),
          })),
        )
        bloqueForma = formaParaPrompt(formas)
      }
    }

    const model = readEnv('TIPSTER_BOT_MODEL') ?? DEFAULT_MODEL
    const userText = [
      'Un usuario del sportsbook te pregunta EN CHAT por este partido concreto. Catálogo real de Azuro (mercados activos y cuotas decimales):',
      JSON.stringify(game),
      bloqueForma ?? 'No hay datos de forma reciente para este partido: dilo si te los piden y no los inventes.',
      pregunta !== null
        ? `Pregunta del usuario: "${pregunta}"`
        : 'El usuario no hizo una pregunta concreta: dale tu pronóstico general del partido con el método del tipster.',
      'Responde en "respuesta" en español, cercano y directo (máximo ~120 palabras), citando cuotas reales del catálogo cuando las menciones. Si con el método del tipster ves una apuesta clara en este partido, añádela en "picks" (máximo 2); si no la ves, deja "picks" vacío y explica por qué no apostarías. Recuerda al usuario que decide él si la pregunta lo amerita.',
    ].join('\n\n')

    const parsed = await llamarGemini({
      apiKey,
      model,
      systemPrompt,
      userText,
      schema: RESPONSE_SCHEMA,
      temperature: 0.4,
    })
    const respuesta = isRecord(parsed) && typeof parsed.respuesta === 'string'
      ? parsed.respuesta.trim()
      : ''
    if (respuesta === '') throw new Error('Gemini no devolvió el campo respuesta')
    const { validos } = validatePicks(parseGeminiPicks(parsed), catalog)

    const payload = {
      generatedAt: new Date().toISOString(),
      modelo: model,
      partido: game.partido,
      respuesta,
      picks: validos,
      // La forma usada, para que la UI pueda enseñar de dónde sale el juicio.
      forma: formas
        .filter((f) => f.forma !== null)
        .map((f) => ({ equipo: f.nombreAzuro, racha: f.forma!.racha })),
      restantes: { hora: turno.restantesHora, dia: turno.restantesDia },
      aviso: AVISO,
    }
    cache.set(cacheKey, { at: Date.now(), payload })
    if (cache.size > CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    sendJson(res, 200, payload)
  } catch (error) {
    sendJson(res, 502, {
      error: 'El tipster no pudo responder.',
      detalle: error instanceof Error ? error.message : String(error),
    })
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
