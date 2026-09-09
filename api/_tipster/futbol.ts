/**
 * DATOS DE FÚTBOL para el bot: forma reciente de los equipos, raspada de
 * TheSportsDB (datos públicos, clave de demostración "123", sin registro).
 *
 * Por qué esta fuente (verificado 2026-09-08): Sofascore devuelve 403 a IPs
 * de datacenter, Flashscore exige ejecutar JS; TheSportsDB responde JSON
 * plano a cualquier IP y cubre las ligas que publica Azuro.
 *
 * Diseño defensivo:
 *  - Todo lo externo entra como `unknown` y se valida campo a campo.
 *  - Nunca lanza: si el equipo no aparece o la red falla, devuelve null y el
 *    prompt le dice al modelo que no hay datos (que NO los invente).
 *  - Caché en memoria por equipo (TTL 6 h): la forma cambia partido a
 *    partido, no minuto a minuto, y el tier gratuito aguanta poco tráfico.
 */

/**
 * Clave de TheSportsDB: la de demostración "123" funciona sin registro pero
 * `eventslast` solo devuelve EL ÚLTIMO partido (verificado 2026-09-08); con
 * clave propia (THESPORTSDB_KEY en Vercel, hay tier de pago barato) devuelve
 * los últimos 5 y la racha gana chicha.
 */
function tsdbApi(): string {
  const key = process.env.THESPORTSDB_KEY
  return `https://www.thesportsdb.com/api/v1/json/${
    typeof key === 'string' && key.trim() !== '' ? key.trim() : '123'
  }`
}
/** Últimos partidos que se resumen por equipo. */
const MAX_PARTIDOS = 5
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

export interface PartidoReciente {
  fecha: string
  torneo: string
  partido: string
  marcador: string
  /** Resultado desde el punto de vista del equipo consultado. */
  resultado: 'G' | 'E' | 'P'
}

export interface FormaEquipo {
  /** Nombre canónico según la fuente (puede diferir del de Azuro). */
  equipo: string
  /** Racha compacta, más reciente primero: "G-G-E-P-G". */
  racha: string
  ultimos: PartidoReciente[]
}

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null
}

/** Sin acentos, sin mayúsculas, sin bordes: para casar nombres entre fuentes. */
function normalizar(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Variantes de búsqueda para un nombre de Azuro: tal cual y sin las siglas de
 * club ("SC Heerenveen" → "Heerenveen"), que TheSportsDB a veces no usa.
 */
export function variantesDeBusqueda(nombre: string): string[] {
  const limpio = nombre.trim()
  const sinSiglas = limpio
    .replace(/^(FC|CF|SC|AC|AS|CD|UD|SD|SK|BK|IF|AFC|RCD|CA)\s+/i, '')
    .replace(/\s+(FC|CF|SC|AC|CD|UD|SD|SK|BK|IF|AFC)$/i, '')
    .trim()
  return sinSiglas !== '' && sinSiglas !== limpio ? [limpio, sinSiglas] : [limpio]
}

/**
 * Parser puro de la respuesta de `searchteams.php`: el equipo de fútbol cuyo
 * nombre (o alternativo) mejor casa con lo buscado, o null.
 */
export function parsearBusquedaEquipos(
  body: unknown,
  buscado: string,
): { id: string; nombre: string } | null {
  if (!isRecord(body) || !Array.isArray(body.teams)) return null
  const objetivo = normalizar(buscado)

  let primero: { id: string; nombre: string } | null = null
  for (const raw of body.teams) {
    if (!isRecord(raw)) continue
    if (raw.strSport !== 'Soccer') continue
    if (typeof raw.idTeam !== 'string' || typeof raw.strTeam !== 'string') continue
    const candidato = { id: raw.idTeam, nombre: raw.strTeam }
    primero ??= candidato

    const nombres = [
      raw.strTeam,
      ...(typeof raw.strTeamAlternate === 'string' ? raw.strTeamAlternate.split(',') : []),
    ].map(normalizar)
    if (nombres.some((n) => n === objetivo || n.includes(objetivo) || objetivo.includes(n))) {
      return candidato
    }
  }
  // Sin coincidencia exacta: el primer equipo de fútbol del listado (la API
  // ya ordena por relevancia).
  return primero
}

/** Parser puro de `eventslast.php`: los últimos partidos, ya jugados, del equipo. */
export function parsearUltimosEventos(body: unknown, idEquipo: string): PartidoReciente[] {
  if (!isRecord(body) || !Array.isArray(body.results)) return []
  const partidos: PartidoReciente[] = []
  for (const raw of body.results) {
    if (partidos.length >= MAX_PARTIDOS) break
    if (!isRecord(raw)) continue
    if (typeof raw.strEvent !== 'string' || typeof raw.dateEvent !== 'string') continue
    // Marcadores como string no vacío o número: `Number(null)` sería 0 y un
    // partido aún no jugado se colaría como 0-0.
    const golesLocal = leerGoles(raw.intHomeScore)
    const golesVisita = leerGoles(raw.intAwayScore)
    if (golesLocal === null || golesVisita === null) continue

    const esLocal = raw.idHomeTeam === idEquipo
    const esVisita = raw.idAwayTeam === idEquipo
    if (!esLocal && !esVisita) continue

    const propios = esLocal ? golesLocal : golesVisita
    const ajenos = esLocal ? golesVisita : golesLocal
    partidos.push({
      fecha: raw.dateEvent,
      torneo: typeof raw.strLeague === 'string' ? raw.strLeague : 'desconocido',
      partido: raw.strEvent,
      marcador: `${golesLocal}-${golesVisita}`,
      resultado: propios > ajenos ? 'G' : propios === ajenos ? 'E' : 'P',
    })
  }
  return partidos
}

/** Goles válidos: string numérico no vacío o número finito; lo demás, null. */
function leerGoles(u: unknown): number | null {
  if (typeof u === 'string' && u.trim() !== '' && Number.isFinite(Number(u))) return Number(u)
  if (typeof u === 'number' && Number.isFinite(u)) return u
  return null
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`TheSportsDB ${res.status}`)
  return (await res.json()) as unknown
}

/** Caché por nombre normalizado; también se cachean los "no encontrado". */
const cacheForma = new Map<string, { at: number; forma: FormaEquipo | null }>()
const CACHE_MAX = 200

/**
 * Forma reciente de un equipo por su nombre tal y como lo publica Azuro.
 * Nunca lanza: sin datos (equipo no encontrado, red caída) devuelve null.
 */
export async function formaDeEquipo(nombre: string): Promise<FormaEquipo | null> {
  const clave = normalizar(nombre)
  if (clave === '') return null
  const cacheada = cacheForma.get(clave)
  if (cacheada !== undefined && Date.now() - cacheada.at < CACHE_TTL_MS) {
    return cacheada.forma
  }

  let forma: FormaEquipo | null = null
  try {
    for (const variante of variantesDeBusqueda(nombre)) {
      const busqueda = await fetchJson(
        `${tsdbApi()}/searchteams.php?t=${encodeURIComponent(variante)}`,
      )
      const equipo = parsearBusquedaEquipos(busqueda, variante)
      if (equipo === null) continue

      const eventos = await fetchJson(`${tsdbApi()}/eventslast.php?id=${equipo.id}`)
      const ultimos = parsearUltimosEventos(eventos, equipo.id)
      if (ultimos.length === 0) continue

      forma = {
        equipo: equipo.nombre,
        racha: ultimos.map((p) => p.resultado).join('-'),
        ultimos,
      }
      break
    }
  } catch {
    // Fuente caída o bloqueada: se opera sin datos de forma. No se cachea el
    // fallo de red (sí el "no encontrado") para reintentar en la siguiente.
    return null
  }

  cacheForma.set(clave, { at: Date.now(), forma })
  if (cacheForma.size > CACHE_MAX) {
    const masVieja = cacheForma.keys().next().value
    if (masVieja !== undefined) cacheForma.delete(masVieja)
  }
  return forma
}

/**
 * Bloque de texto con la forma de varios equipos, para inyectar en el prompt.
 * Deja constancia explícita de los equipos SIN datos: el modelo tiene
 * prohibido inventarlos.
 */
export function formaParaPrompt(
  formas: { nombreAzuro: string; forma: FormaEquipo | null }[],
): string {
  const lineas = formas.map(({ nombreAzuro, forma }) => {
    if (forma === null) {
      return `- ${nombreAzuro}: SIN datos de forma reciente (no los inventes).`
    }
    const detalle = forma.ultimos
      .map((p) => `${p.fecha} ${p.partido} ${p.marcador} (${p.resultado}, ${p.torneo})`)
      .join('; ')
    return `- ${nombreAzuro} (como "${forma.equipo}"), racha ${forma.racha}: ${detalle}`
  })
  return `Forma reciente según resultados públicos (G=ganó, E=empató, P=perdió; más reciente primero):\n${lineas.join('\n')}`
}
