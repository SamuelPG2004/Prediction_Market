/**
 * Traducción al español de etiquetas de venue, solo para presentación.
 *
 * Los venues publican los nombres de mercado y de resultado en inglés
 * ("Match Winner", "Over (17.5)"). El dominio conserva la etiqueta original
 * —casar resultados con participantes o rankear mercados sigue operando
 * sobre ella— y estas funciones se aplican al pintar. Una etiqueta
 * desconocida se devuelve intacta: nunca es peor que no traducir.
 */

/** Nombres de mercado (en minúsculas) → español. */
const MARKET_NAMES = new Map<string, string>([
  ['match winner', 'Ganador del partido'],
  ['full time result', 'Resultado final'],
  ['half time result', 'Resultado al descanso'],
  ['winner', 'Ganador'],
  ['money line', 'Ganador'],
  ['moneyline', 'Ganador'],
  ['double chance', 'Doble oportunidad'],
  ['draw no bet', 'Apuesta sin empate'],
  ['both teams to score', 'Ambos equipos marcan'],
  ['correct score', 'Marcador exacto'],
  ['total', 'Total'],
  ['total goals', 'Goles totales'],
  ['total points', 'Puntos totales'],
  ['total games', 'Juegos totales'],
  ['total sets', 'Sets totales'],
  ['total maps', 'Mapas totales'],
  ['total rounds', 'Asaltos totales'],
  ['total runs', 'Carreras totales'],
  ['total corners', 'Córneres totales'],
  ['individual total', 'Total individual'],
  ['asian total', 'Total asiático'],
  ['handicap', 'Hándicap'],
  ['asian handicap', 'Hándicap asiático'],
  ['handicap games', 'Hándicap de juegos'],
  ['handicap sets', 'Hándicap de sets'],
  ['handicap points', 'Hándicap de puntos'],
  ['handicap maps', 'Hándicap de mapas'],
  ['first team to score', 'Primer equipo en marcar'],
])

/** Tramos del partido en prefijos tipo "1st Set: …" o "2nd Half: …". */
const PERIOD_NOUNS = new Map<string, { noun: string; feminine: boolean }>([
  ['set', { noun: 'set', feminine: false }],
  ['half', { noun: 'parte', feminine: true }],
  ['quarter', { noun: 'cuarto', feminine: false }],
  ['period', { noun: 'periodo', feminine: false }],
  ['map', { noun: 'mapa', feminine: false }],
  ['game', { noun: 'juego', feminine: false }],
  ['inning', { noun: 'entrada', feminine: true }],
  ['round', { noun: 'asalto', feminine: false }],
])

/** "1er"/"3er" solo delante de sustantivo masculino; el resto, "2º"/"2ª". */
function ordinalEs(n: number, feminine: boolean): string {
  if (feminine) return `${n}ª`
  return n === 1 || n === 3 ? `${n}er` : `${n}º`
}

const PERIOD_PREFIX =
  /^(\d+)(?:st|nd|rd|th)\s+(set|half|quarter|period|map|game|inning|round)\s*:\s*(.+)$/i
const ODD_EVEN_SUFFIX = /^(.*\S)\s+odd\/even$/i

function baseNameOf(label: string): string | null {
  return MARKET_NAMES.get(label.trim().toLowerCase()) ?? null
}

/** `null` si ninguna regla reconoce la etiqueta. */
function translateIfKnown(label: string): string | null {
  const exact = baseNameOf(label)
  if (exact !== null) return exact

  // "1st Set: Total Games" → "Juegos totales · 1er set". El tramo se traduce
  // aunque el mercado interior no se reconozca: sigue siendo más legible.
  const period = label.match(PERIOD_PREFIX)
  if (period !== null) {
    const info = PERIOD_NOUNS.get(period[2].toLowerCase())
    if (info !== undefined) {
      const rest = translateIfKnown(period[3]) ?? period[3]
      return `${rest} · ${ordinalEs(Number(period[1]), info.feminine)} ${info.noun}`
    }
  }

  // "Total Games Odd/Even" → "Juegos totales: par/impar".
  const oddEven = label.match(ODD_EVEN_SUFFIX)
  if (oddEven !== null) return `${baseNameOf(oddEven[1]) ?? oddEven[1]}: par/impar`

  // "Jugadora - Total Games": mercado acotado a un participante. Solo se
  // reescribe si la parte derecha es un mercado reconocible: un guion también
  // separa "Equipo A - Equipo B", que debe quedar intacto.
  const dash = label.match(/^(.+?)\s+-\s+(.+)$/)
  if (dash !== null) {
    const right = translateIfKnown(dash[2])
    if (right !== null) return `${dash[1]} · ${right}`
  }

  return null
}

/** Etiqueta de mercado en español, o la original si no se reconoce. */
export function translateMarketLabel(label: string): string {
  return translateIfKnown(label) ?? label
}

/** Nombres de resultado (en minúsculas) → español. */
const OUTCOME_NAMES = new Map<string, string>([
  ['draw', 'Empate'],
  ['x', 'Empate'],
  ['odd', 'Impar'],
  ['even', 'Par'],
  ['yes', 'Sí'],
  ['no', 'No'],
])

const OVER_UNDER = /^(over|under)\s*\((.+)\)$/i

/**
 * Etiqueta de resultado en español, o la original si no se reconoce.
 * Los nombres de participantes (con o sin hándicap) se dejan tal cual.
 */
export function translateOutcomeLabel(label: string): string {
  const trimmed = label.trim()
  const ou = trimmed.match(OVER_UNDER)
  if (ou !== null) {
    return `${ou[1].toLowerCase() === 'over' ? 'Más de' : 'Menos de'} ${ou[2]}`
  }
  return OUTCOME_NAMES.get(trimmed.toLowerCase()) ?? label
}
