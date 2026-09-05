/**
 * Presentación de países de competición: bandera emoji y nombre en español.
 *
 * Los venues publican el país en inglés ("Spain", "Czech Republic"). Aquí se
 * casa contra ISO 3166-1 y el nombre español sale de `Intl.DisplayNames`, que
 * ya sabe declinar "Alemania" o "Emiratos Árabes Unidos" sin diccionario
 * propio. Un país no reconocido (organizaciones como "ATP") se devuelve tal
 * cual con el globo: nunca se inventa una bandera.
 */

/** Nombre en minúsculas → código ISO 3166-1 alfa-2. */
const COUNTRY_ISO = new Map<string, string>([
  ['albania', 'AL'],
  ['algeria', 'DZ'],
  ['andorra', 'AD'],
  ['argentina', 'AR'],
  ['armenia', 'AM'],
  ['australia', 'AU'],
  ['austria', 'AT'],
  ['azerbaijan', 'AZ'],
  ['bahrain', 'BH'],
  ['belarus', 'BY'],
  ['belgium', 'BE'],
  ['bolivia', 'BO'],
  ['bosnia and herzegovina', 'BA'],
  ['brazil', 'BR'],
  ['bulgaria', 'BG'],
  ['canada', 'CA'],
  ['chile', 'CL'],
  ['china', 'CN'],
  ['colombia', 'CO'],
  ['costa rica', 'CR'],
  ['croatia', 'HR'],
  ['cyprus', 'CY'],
  ['czech republic', 'CZ'],
  ['czechia', 'CZ'],
  ['denmark', 'DK'],
  ['dominican republic', 'DO'],
  ['ecuador', 'EC'],
  ['egypt', 'EG'],
  ['el salvador', 'SV'],
  ['estonia', 'EE'],
  ['finland', 'FI'],
  ['france', 'FR'],
  ['georgia', 'GE'],
  ['germany', 'DE'],
  ['greece', 'GR'],
  ['guatemala', 'GT'],
  ['honduras', 'HN'],
  ['hong kong', 'HK'],
  ['hungary', 'HU'],
  ['iceland', 'IS'],
  ['india', 'IN'],
  ['indonesia', 'ID'],
  ['iran', 'IR'],
  ['iraq', 'IQ'],
  ['ireland', 'IE'],
  ['israel', 'IL'],
  ['italy', 'IT'],
  ['jamaica', 'JM'],
  ['japan', 'JP'],
  ['jordan', 'JO'],
  ['kazakhstan', 'KZ'],
  ['kenya', 'KE'],
  ['kuwait', 'KW'],
  ['latvia', 'LV'],
  ['lithuania', 'LT'],
  ['luxembourg', 'LU'],
  ['malaysia', 'MY'],
  ['malta', 'MT'],
  ['mexico', 'MX'],
  ['moldova', 'MD'],
  ['montenegro', 'ME'],
  ['morocco', 'MA'],
  ['netherlands', 'NL'],
  ['new zealand', 'NZ'],
  ['nicaragua', 'NI'],
  ['nigeria', 'NG'],
  ['north macedonia', 'MK'],
  ['norway', 'NO'],
  ['oman', 'OM'],
  ['panama', 'PA'],
  ['paraguay', 'PY'],
  ['peru', 'PE'],
  ['philippines', 'PH'],
  ['poland', 'PL'],
  ['portugal', 'PT'],
  ['qatar', 'QA'],
  ['romania', 'RO'],
  ['russia', 'RU'],
  ['saudi arabia', 'SA'],
  ['senegal', 'SN'],
  ['serbia', 'RS'],
  ['singapore', 'SG'],
  ['slovakia', 'SK'],
  ['slovenia', 'SI'],
  ['south africa', 'ZA'],
  ['south korea', 'KR'],
  ['spain', 'ES'],
  ['sweden', 'SE'],
  ['switzerland', 'CH'],
  ['taiwan', 'TW'],
  ['thailand', 'TH'],
  ['tunisia', 'TN'],
  ['turkey', 'TR'],
  ['ukraine', 'UA'],
  ['united arab emirates', 'AE'],
  ['united kingdom', 'GB'],
  ['united states', 'US'],
  ['uruguay', 'UY'],
  ['usa', 'US'],
  ['uzbekistan', 'UZ'],
  ['venezuela', 'VE'],
  ['vietnam', 'VN'],
])

/**
 * Ámbitos sin ISO 3166-1 propio: naciones constituyentes (flagcdn las sirve
 * con códigos gb-*) y agrupaciones supranacionales (sin bandera: globo).
 */
const SPECIALS = new Map<string, { code: string | null; label: string }>([
  ['england', { code: 'gb-eng', label: 'Inglaterra' }],
  ['scotland', { code: 'gb-sct', label: 'Escocia' }],
  ['wales', { code: 'gb-wls', label: 'Gales' }],
  ['northern ireland', { code: 'gb-nir', label: 'Irlanda del Norte' }],
  ['international', { code: null, label: 'Internacional' }],
  ['international tournaments', { code: null, label: 'Torneos internacionales' }],
  ['world', { code: null, label: 'Mundo' }],
  ['europe', { code: 'eu', label: 'Europa' }],
])

/** Sufijos de ámbito que algunos venues pegan al país ("Germany Amateur"). */
const SUFFIXES = new Map<string, string>([
  ['amateur', 'Aficionado'],
  ['women', 'Femenino'],
  ['youth', 'Juvenil'],
])

/** "DE" → 🇩🇪 vía indicadores regionales (reserva si la imagen no carga). */
function isoToEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('')
}

/**
 * PNG de la bandera en flagcdn (w40 ≈ 2x para mostrarla a 20px). Se usa
 * imagen y no emoji porque Windows no renderiza los emoji de bandera (caen a
 * las letras ISO); el emoji queda como reserva si la imagen falla.
 */
function flagUrlOf(code: string): string {
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`
}

const displayNamesEs =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['es'], { type: 'region' })
    : null

export interface CountryDisplay {
  label: string
  /** Imagen de la bandera, o `null` si el ámbito no tiene (Internacional…). */
  flagUrl: string | null
  /** Emoji de reserva: la bandera si existe, 🌍 para ámbitos, 🌐 desconocidos. */
  fallback: string
}

/** Bandera y nombre en español de un país de competición del venue. */
export function countryDisplay(name: string): CountryDisplay {
  const normalized = name.trim().toLowerCase()

  // "Germany Amateur" → la presentación de "Germany" + su sufijo traducido.
  for (const [suffix, suffixEs] of SUFFIXES) {
    if (normalized.endsWith(` ${suffix}`)) {
      const base = countryDisplay(name.trim().slice(0, -(suffix.length + 1)))
      return { ...base, label: `${base.label} ${suffixEs}` }
    }
  }

  const special = SPECIALS.get(normalized)
  if (special !== undefined) {
    return {
      label: special.label,
      flagUrl: special.code !== null ? flagUrlOf(special.code) : null,
      fallback: '🌍',
    }
  }

  const iso = COUNTRY_ISO.get(normalized)
  if (iso !== undefined) {
    let label = name
    try {
      label = displayNamesEs?.of(iso) ?? name
    } catch {
      // código fuera del estándar según este runtime: se queda el original
    }
    return { label, flagUrl: flagUrlOf(iso), fallback: isoToEmoji(iso) }
  }

  // Organizaciones (ATP, NCAA…) o países fuera del mapa: tal cual, con globo.
  return { label: name, flagUrl: null, fallback: '🌐' }
}
