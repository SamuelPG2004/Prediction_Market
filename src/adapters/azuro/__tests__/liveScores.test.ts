/**
 * Marcadores en vivo: validación y mapeo con el snapshot REAL del socket de
 * estadísticas (ver fixtures/README.md), más la suscripción del adaptador con
 * un cliente falso. Sin red ni sockets.
 */
import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { AzuroAdapter } from '../AzuroAdapter.ts'
import { makeAzuroConfig } from '../config.ts'
import type { AzuroGateway } from '../gateway.ts'
import type { AzuroLiveScoreClient } from '../liveScoreSocket.ts'
import { isLiveScoreEligibleGameId, mapLiveScore } from '../mappers.ts'
import { parseLiveScoreEntries, type RawLiveScoreEntry } from '../validate.ts'
import snapshotFixture from './fixtures/live-statistics.json'

// Anclas del fixture (capturado 2026-09-06 con 8 partidos en juego).
const FUTBOL_GAME_ID = '1006000000000089890534' // Racing - Tucumán, 1-1, min 91
const FUTBOL_TEMPRANO_GAME_ID = '1006000000000091879868' // Toluca - Monterrey, 1-0, min 47
const TENIS_GAME_ID = '1006000000000030814144' // 1-0 en sets, jugando el 2º
const BASKET_GAME_ID = '1006000000000030820034' // 128-91, cuarto 4

const UPDATED_AT = new Date('2026-09-06T00:00:00Z')

function entryById(id: string): RawLiveScoreEntry {
  const parsed = parseLiveScoreEntries(snapshotFixture as unknown)
  if (parsed === null) throw new Error('el fixture del socket no valida')
  const entry = parsed.value.find((e) => e.gameId === id)
  if (entry === undefined) throw new Error(`falta la entrada ${id} en el fixture`)
  return entry
}

describe('parseLiveScoreEntries con el snapshot real', () => {
  it('valida las 8 entradas sin descartar nada', () => {
    const parsed = parseLiveScoreEntries(snapshotFixture as unknown)
    expect(parsed).not.toBeNull()
    expect(parsed?.dropped).toBe(0)
    expect(parsed?.value).toHaveLength(8)
  })

  it('lo que no es un array es una respuesta inválida', () => {
    expect(parseLiveScoreEntries({ id: 'x' })).toBeNull()
    expect(parseLiveScoreEntries('[]')).toBeNull()
  })

  it('una entrada sin id se descarta sin tirar el mensaje', () => {
    const parsed = parseLiveScoreEntries([{ fixture: null, live: null }])
    expect(parsed?.dropped).toBe(1)
    expect(parsed?.value).toHaveLength(0)
  })
})

describe('mapLiveScore: fútbol', () => {
  it('saca los goles de stats.goals y el minuto del timeline (el scoreBoard real llega vacío)', () => {
    const score = mapLiveScore(entryById(FUTBOL_GAME_ID), UPDATED_AT)
    expect(score).toEqual({
      groupId: FUTBOL_GAME_ID,
      status: 'live',
      home: 1,
      guest: 1,
      phase: { kind: 'match', minute: 91 },
      updatedAt: UPDATED_AT,
    })
  })

  it('el otro partido del fixture confirma que no es casualidad', () => {
    const score = mapLiveScore(entryById(FUTBOL_TEMPRANO_GAME_ID), UPDATED_AT)
    expect(score?.home).toBe(1)
    expect(score?.guest).toBe(0)
    expect(score?.phase).toEqual({ kind: 'match', minute: 47 })
  })
})

describe('mapLiveScore: tenis y baloncesto', () => {
  it('tenis: sets ganados de marcador, juegos por set como parciales, y el set en juego', () => {
    // El proveedor manda los números COMO STRINGS y -1 en los sets no jugados;
    // que este test pase con el fixture real prueba que ambos se toleran.
    const score = mapLiveScore(entryById(TENIS_GAME_ID), UPDATED_AT)
    expect(score).toEqual({
      groupId: TENIS_GAME_ID,
      status: 'live',
      home: 1,
      guest: 0,
      phase: { kind: 'set', number: 2 },
      periodScores: [
        { home: 6, guest: 1 },
        { home: 4, guest: 3 },
      ],
      updatedAt: UPDATED_AT,
    })
  })

  it('baloncesto: puntos totales, parciales por cuarto, y cuarto con reloj', () => {
    const score = mapLiveScore(entryById(BASKET_GAME_ID), UPDATED_AT)
    expect(score).toEqual({
      groupId: BASKET_GAME_ID,
      status: 'live',
      home: 128,
      guest: 91,
      phase: { kind: 'quarter', number: 4, clock: '03:00' },
      periodScores: [
        { home: 47, guest: 21 },
        { home: 32, guest: 20 },
        { home: 26, guest: 31 },
        { home: 23, guest: 19 },
      ],
      updatedAt: UPDATED_AT,
    })
  })
})

describe('mapLiveScore: degradaciones (dinero real)', () => {
  const base = entryById(FUTBOL_GAME_ID)

  it('cobertura perdida degrada a suspended aunque haya marcador', () => {
    const score = mapLiveScore({ ...base, status: 'Coverage lost' }, UPDATED_AT)
    expect(score?.status).toBe('suspended')
  })

  it('un estado desconocido del proveedor también degrada a suspended', () => {
    const score = mapLiveScore({ ...base, status: 'Whatever new' }, UPDATED_AT)
    expect(score?.status).toBe('suspended')
  })

  it('un partido sin empezar no emite nada', () => {
    expect(mapLiveScore({ ...base, status: 'Not started yet' }, UPDATED_AT)).toBeNull()
  })

  it('terminado con marcador emite el final; sin marcador, nada (antes que inventarlo)', () => {
    expect(mapLiveScore({ ...base, status: 'Finished' }, UPDATED_AT)?.status).toBe(
      'finished',
    )
    const sinMarcador: RawLiveScoreEntry = {
      gameId: 'x',
      status: 'Finished',
      scoreBoard: null,
      statsGoals: null,
      lastIncidentMinute: null,
    }
    expect(mapLiveScore(sinMarcador, UPDATED_AT)).toBeNull()
  })

  it('en juego pero sin marcador utilizable todavía: nada', () => {
    const sinDatos: RawLiveScoreEntry = {
      gameId: 'x',
      status: 'In progress',
      scoreBoard: {
        state: null,
        time: null,
        goals: null,
        sets: null,
        total: null,
        periods: [],
      },
      statsGoals: null,
      lastIncidentMinute: null,
    }
    expect(mapLiveScore(sinDatos, UPDATED_AT)).toBeNull()
  })

  it('suspendido sin marcador SÍ emite, para poder retirar uno ya mostrado', () => {
    const suspendido: RawLiveScoreEntry = {
      gameId: 'x',
      status: 'Suspended',
      scoreBoard: null,
      statsGoals: null,
      lastIncidentMinute: null,
    }
    expect(mapLiveScore(suspendido, UPDATED_AT)?.status).toBe('suspended')
  })
})

describe('isLiveScoreEligibleGameId', () => {
  it('solo el proveedor 6 (caracteres 2-4 del gameId) es elegible', () => {
    expect(isLiveScoreEligibleGameId(FUTBOL_GAME_ID)).toBe(true)
    expect(isLiveScoreEligibleGameId('1005000000000030699275')).toBe(false)
    expect(isLiveScoreEligibleGameId('no-es-un-gameId')).toBe(false)
  })
})

// --- Suscripción del adaptador ----------------------------------------------

/** El gateway no interviene en los marcadores; cualquier llamada es un bug. */
const unusedGateway = new Proxy({} as AzuroGateway, {
  get(_target, prop) {
    return () => Promise.reject(new Error(`gateway.${String(prop)} no debería llamarse`))
  },
})

class FakeLiveScoreClient implements AzuroLiveScoreClient {
  subscribedGameIds: string[][] = []
  unsubscribes = 0
  private onMessage: ((message: unknown) => void) | null = null

  subscribe(gameIds: string[], onMessage: (message: unknown) => void) {
    this.subscribedGameIds.push(gameIds)
    this.onMessage = onMessage
    return () => {
      this.unsubscribes += 1
    }
  }

  push(message: unknown) {
    this.onMessage?.(message)
  }
}

const AFFILIATE = '0x1111111111111111111111111111111111111111' as Address

function makeAdapter(liveScores?: AzuroLiveScoreClient) {
  return new AzuroAdapter({
    config: makeAzuroConfig(137, AFFILIATE),
    gateway: unusedGateway,
    ...(liveScores !== undefined ? { liveScores } : {}),
  })
}

describe('AzuroAdapter.subscribeLiveScores', () => {
  it('la capacidad refleja si hay cliente de socket', () => {
    expect(makeAdapter().capabilities.canLiveScores).toBe(false)
    expect(makeAdapter(new FakeLiveScoreClient()).capabilities.canLiveScores).toBe(true)
  })

  it('filtra los grupos no elegibles antes de suscribir; sin ninguno, ni conecta', () => {
    const client = new FakeLiveScoreClient()
    const adapter = makeAdapter(client)

    const unsub = adapter.subscribeLiveScores(
      [FUTBOL_GAME_ID, '1005000000000000000000001'],
      () => {},
    )
    expect(client.subscribedGameIds).toEqual([[FUTBOL_GAME_ID]])
    unsub()
    expect(client.unsubscribes).toBe(1)

    adapter.subscribeLiveScores(['1005000000000000000000001'], () => {})
    expect(client.subscribedGameIds).toHaveLength(1) // no hubo segunda suscripción
  })

  it('entrega solo los marcadores de los grupos pedidos, ya mapeados', () => {
    const client = new FakeLiveScoreClient()
    const adapter = makeAdapter(client)
    const received: string[] = []

    adapter.subscribeLiveScores([TENIS_GAME_ID], (score) => {
      received.push(`${score.groupId}:${score.home}-${score.guest}`)
    })
    // El snapshot real trae 8 partidos; solo el pedido debe llegar.
    client.push(snapshotFixture as unknown)
    expect(received).toEqual([`${TENIS_GAME_ID}:1-0`])

    // Un mensaje malformado no rompe la suscripción.
    client.push({ nada: true })
    client.push(snapshotFixture as unknown)
    expect(received).toHaveLength(2)
  })

  it('sin cliente inyectado la suscripción es un no-op seguro', () => {
    const unsub = makeAdapter().subscribeLiveScores([FUTBOL_GAME_ID], () => {
      throw new Error('no debería recibir nada')
    })
    unsub()
  })
})
