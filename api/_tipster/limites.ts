/**
 * LÍMITES DE USO del chat del tipster, para no salirnos del tier gratuito de
 * Gemini (~250 peticiones/día en flash) dejando margen a la pasada automática
 * de /api/tipster-bot (≤96/día con su caché de 15 min).
 *
 * Es un limitador en memoria por instancia de la función: aproximado (cada
 * instancia cuenta por su lado y un redeploy lo resetea), pero suficiente
 * como freno del tier gratuito, igual que la caché del bot. Si algún día hay
 * abuso real, el paso siguiente es un KV externo, no afinar esto.
 */

/** Peticiones por IP por hora. */
export const LIMITE_IP_HORA = 10
/** Peticiones globales por día (UTC), entre todas las IPs. */
export const LIMITE_GLOBAL_DIA = 120

const HORA_MS = 60 * 60 * 1000
/** Marcas de tiempo de las peticiones aceptadas, por IP. */
const porIp = new Map<string, number[]>()
const MAX_IPS = 500
/** Contador global del día UTC en curso. */
let dia = { fecha: '', total: 0 }

export type ResultadoLimite =
  | { ok: true; restantesHora: number; restantesDia: number }
  | { ok: false; motivo: string; reintentarEnSegundos: number }

/** Registra un intento y dice si pasa. `ahora` es inyectable para tests. */
export function consumirTurno(ip: string, ahora = Date.now()): ResultadoLimite {
  const hoy = new Date(ahora).toISOString().slice(0, 10)
  if (dia.fecha !== hoy) dia = { fecha: hoy, total: 0 }

  if (dia.total >= LIMITE_GLOBAL_DIA) {
    const medianoche = new Date(`${hoy}T23:59:59.999Z`).getTime()
    return {
      ok: false,
      motivo: 'El tipster agotó su cupo diario de consultas (tier gratuito de la IA). Mañana vuelve a estar disponible.',
      reintentarEnSegundos: Math.max(60, Math.ceil((medianoche - ahora) / 1000)),
    }
  }

  const recientes = (porIp.get(ip) ?? []).filter((t) => ahora - t < HORA_MS)
  if (recientes.length >= LIMITE_IP_HORA) {
    const masVieja = recientes[0]!
    return {
      ok: false,
      motivo: `Has agotado tus ${LIMITE_IP_HORA} consultas por hora. Dale un respiro al tipster.`,
      reintentarEnSegundos: Math.max(30, Math.ceil((masVieja + HORA_MS - ahora) / 1000)),
    }
  }

  recientes.push(ahora)
  porIp.set(ip, recientes)
  // Tope de IPs recordadas: fuera la más vieja (orden de inserción del Map).
  if (porIp.size > MAX_IPS) {
    const primera = porIp.keys().next().value
    if (primera !== undefined) porIp.delete(primera)
  }
  dia.total += 1
  return {
    ok: true,
    restantesHora: LIMITE_IP_HORA - recientes.length,
    restantesDia: LIMITE_GLOBAL_DIA - dia.total,
  }
}

/** Solo para tests: vuelve al estado inicial. */
export function resetLimites(): void {
  porIp.clear()
  dia = { fecha: '', total: 0 }
}
