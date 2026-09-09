import { beforeEach, describe, expect, it } from 'vitest'
import {
  LIMITE_GLOBAL_DIA,
  LIMITE_IP_HORA,
  consumirTurno,
  resetLimites,
} from '../limites.ts'

const T0 = Date.parse('2026-09-08T12:00:00Z')
const HORA = 60 * 60 * 1000

describe('consumirTurno', () => {
  beforeEach(() => {
    resetLimites()
  })

  it('deja pasar hasta el límite por hora y luego corta con tiempo de espera', () => {
    for (let i = 0; i < LIMITE_IP_HORA; i++) {
      const r = consumirTurno('1.2.3.4', T0 + i * 1000)
      expect(r.ok).toBe(true)
    }
    const denegado = consumirTurno('1.2.3.4', T0 + LIMITE_IP_HORA * 1000)
    expect(denegado.ok).toBe(false)
    if (!denegado.ok) {
      expect(denegado.reintentarEnSegundos).toBeGreaterThan(0)
      expect(denegado.reintentarEnSegundos).toBeLessThanOrEqual(3600)
    }
  })

  it('el límite por hora es por IP: otra IP sigue pudiendo', () => {
    for (let i = 0; i < LIMITE_IP_HORA; i++) consumirTurno('1.1.1.1', T0)
    expect(consumirTurno('1.1.1.1', T0 + 1).ok).toBe(false)
    expect(consumirTurno('2.2.2.2', T0 + 1).ok).toBe(true)
  })

  it('pasada la hora, la ventana se libera', () => {
    for (let i = 0; i < LIMITE_IP_HORA; i++) consumirTurno('1.1.1.1', T0)
    expect(consumirTurno('1.1.1.1', T0 + HORA + 1000).ok).toBe(true)
  })

  it('el cupo global diario corta a todas las IPs y se resetea al día siguiente', () => {
    let usados = 0
    let ip = 0
    // Muchas IPs distintas para no chocar antes con el límite por hora.
    while (usados < LIMITE_GLOBAL_DIA) {
      const r = consumirTurno(`ip-${ip}`, T0 + usados)
      expect(r.ok).toBe(true)
      usados += 1
      if (usados % LIMITE_IP_HORA === 0) ip += 1
    }
    const denegado = consumirTurno('otra-ip', T0 + usados)
    expect(denegado.ok).toBe(false)
    // Día siguiente (UTC): vuelve a haber cupo.
    expect(consumirTurno('otra-ip', T0 + 24 * HORA).ok).toBe(true)
  })

  it('informa de los turnos restantes al aceptar', () => {
    const r = consumirTurno('1.2.3.4', T0)
    expect(r).toEqual({
      ok: true,
      restantesHora: LIMITE_IP_HORA - 1,
      restantesDia: LIMITE_GLOBAL_DIA - 1,
    })
  })
})
