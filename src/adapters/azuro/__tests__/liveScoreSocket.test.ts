/**
 * Cliente del socket de estadísticas: ciclo de vida de la conexión,
 * recuento de suscriptores y reconexión. Con sockets falsos, sin red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAzuroLiveScoreClient,
  type LiveScoreSocketLike,
} from '../liveScoreSocket.ts'

type Listener = (event: { data?: unknown; code?: number }) => void

class FakeSocket implements LiveScoreSocketLike {
  readyState = 0 // CONNECTING
  sent: string[] = []
  closedWith: number[] = []
  private listeners: Record<'open' | 'message' | 'close', Listener[]> = {
    open: [],
    message: [],
    close: [],
  }

  addEventListener(type: 'open' | 'message' | 'close', listener: Listener) {
    this.listeners[type].push(listener)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close(code?: number) {
    this.closedWith.push(code ?? 1005)
  }

  // Controles del test: el servidor "responde".
  fireOpen() {
    this.readyState = 1
    for (const l of this.listeners.open) l({})
  }
  fireMessage(data: unknown) {
    for (const l of this.listeners.message) l({ data })
  }
  fireClose(code: number) {
    this.readyState = 3
    for (const l of this.listeners.close) l({ code })
  }
}

function makeClient() {
  const sockets: FakeSocket[] = []
  const client = createAzuroLiveScoreClient(() => {
    const socket = new FakeSocket()
    sockets.push(socket)
    return socket
  })
  return { client, sockets }
}

function actionsOf(socket: FakeSocket): { action: string; gameIds: string[] }[] {
  return socket.sent.map((s) => JSON.parse(s) as { action: string; gameIds: string[] })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createAzuroLiveScoreClient', () => {
  it('abre el socket con el primer suscriptor y suscribe al abrirse', () => {
    const { client, sockets } = makeClient()
    client.subscribe(['g1', 'g2'], () => {})

    expect(sockets).toHaveLength(1)
    expect(sockets[0].sent).toHaveLength(0) // aún conectando: nada que enviar

    sockets[0].fireOpen()
    expect(actionsOf(sockets[0])).toEqual([
      { action: 'subscribe', gameIds: ['g1', 'g2'] },
    ])
  })

  it('un suscriptor nuevo pide TODOS sus juegos, aunque otro ya los tenga', () => {
    const { client, sockets } = makeClient()
    client.subscribe(['g1'], () => {})
    sockets[0].fireOpen()

    client.subscribe(['g1', 'g2'], () => {})
    expect(sockets).toHaveLength(1) // misma conexión
    expect(actionsOf(sockets[0])).toEqual([
      { action: 'subscribe', gameIds: ['g1'] },
      // g1 se repite a propósito: el servidor responde a un subscribe
      // repetido reenviando el snapshot, y el oyente nuevo necesita el
      // marcador actual al instante, no con el siguiente cambio.
      { action: 'subscribe', gameIds: ['g1', 'g2'] },
    ])
  })

  it('entrega cada mensaje deserializado a todos los suscriptores; el JSON corrupto se ignora', () => {
    const { client, sockets } = makeClient()
    const a: unknown[] = []
    const b: unknown[] = []
    client.subscribe(['g1'], (m) => a.push(m))
    client.subscribe(['g2'], (m) => b.push(m))
    sockets[0].fireOpen()

    sockets[0].fireMessage('[{"id":"g1"}]')
    sockets[0].fireMessage('esto no es JSON {')
    sockets[0].fireMessage('[{"id":"g2"}]')

    expect(a).toEqual([[{ id: 'g1' }], [{ id: 'g2' }]])
    expect(b).toEqual(a)
  })

  it('no desuscribe un juego mientras otro oyente lo siga escuchando', () => {
    const { client, sockets } = makeClient()
    const unsubA = client.subscribe(['g1'], () => {})
    client.subscribe(['g1', 'g2'], () => {})
    sockets[0].fireOpen()
    sockets[0].sent = []

    unsubA()
    // g1 sigue teniendo un oyente: ninguna acción hacia el servidor.
    expect(sockets[0].sent).toHaveLength(0)
    expect(sockets[0].closedWith).toHaveLength(0)
  })

  it('el último oyente de un juego lo desuscribe; el último de todos cierra con código propio', () => {
    const { client, sockets } = makeClient()
    const unsubA = client.subscribe(['g1'], () => {})
    const unsubB = client.subscribe(['g2'], () => {})
    sockets[0].fireOpen()
    sockets[0].sent = []

    unsubA()
    expect(actionsOf(sockets[0])).toEqual([
      { action: 'unsubscribe', gameIds: ['g1'] },
    ])

    unsubB()
    // Cierre intencionado (3000): un close() pelado se reporta 1005 y el
    // manejador lo trataría como caída, reconectando para siempre.
    expect(sockets[0].closedWith).toEqual([3000])

    // La baja es idempotente (React puede limpiar dos veces).
    unsubB()
    expect(sockets[0].closedWith).toEqual([3000])
  })

  it('una caída de red reconecta al segundo y resuscribe todo', () => {
    const { client, sockets } = makeClient()
    client.subscribe(['g1'], () => {})
    client.subscribe(['g2'], () => {})
    sockets[0].fireOpen()

    sockets[0].fireClose(1006) // caída anormal
    expect(sockets).toHaveLength(1) // todavía no: espera el retardo

    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(2)
    sockets[1].fireOpen()
    expect(actionsOf(sockets[1])).toEqual([
      { action: 'subscribe', gameIds: ['g1', 'g2'] },
    ])
  })

  it('si durante el retardo de reconexión se van todos, no reconecta', () => {
    const { client, sockets } = makeClient()
    const unsub = client.subscribe(['g1'], () => {})
    sockets[0].fireOpen()

    sockets[0].fireClose(1006)
    unsub()
    vi.advanceTimersByTime(5000)
    expect(sockets).toHaveLength(1)
  })

  it('tras cerrar del todo, un suscriptor nuevo abre una conexión nueva', () => {
    const { client, sockets } = makeClient()
    const unsub = client.subscribe(['g1'], () => {})
    sockets[0].fireOpen()
    unsub()

    client.subscribe(['g2'], () => {})
    expect(sockets).toHaveLength(2)
    sockets[1].fireOpen()
    expect(actionsOf(sockets[1])).toEqual([
      { action: 'subscribe', gameIds: ['g2'] },
    ])
  })
})
