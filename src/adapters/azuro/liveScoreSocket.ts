/**
 * Cliente del socket de estadísticas en vivo de Azuro.
 *
 * Frontera de red (como `gateway.ts`): la UI y el adaptador no saben que hay
 * un WebSocket; los tests inyectan una fábrica falsa y no abren conexiones.
 *
 * Protocolo (verificado con captura real 2026-09-06, y el mismo que usa el
 * SDK oficial):
 *  - URL: `${chainsData[chainId].socket}/statistics/games`.
 *  - Se envía `{ action: 'subscribe' | 'unsubscribe', gameIds: [...] }`.
 *  - Llega un snapshot inicial (array con una entrada por juego) y después
 *    arrays de una entrada por actualización.
 *
 * El cliente es SOLO transporte: entrega cada mensaje ya deserializado como
 * `unknown` a todos los suscriptores; validar y filtrar es del adaptador
 * (misma regla que el gateway: toda respuesta externa se valida en
 * `validate.ts`).
 */
import { chainsData, type ChainId } from '@azuro-org/toolkit'
import type { AzuroChainId } from './config.ts'

/** Lo mínimo de la API de WebSocket del navegador que usa el cliente. */
export interface LiveScoreSocketLike {
  readyState: number
  send(data: string): void
  close(code?: number): void
  addEventListener(
    type: 'open' | 'message' | 'close',
    listener: (event: { data?: unknown; code?: number }) => void,
  ): void
}

export type LiveScoreSocketFactory = () => LiveScoreSocketLike

export interface AzuroLiveScoreClient {
  /**
   * Se suscribe a los juegos y entrega CADA mensaje del socket (deserializado,
   * sin validar) al callback; el llamante filtra por los ids que le importan.
   * Devuelve la función de baja. El socket se abre con el primer suscriptor y
   * se cierra con el último.
   */
  subscribe(gameIds: string[], onMessage: (message: unknown) => void): () => void
}

/** readyState de WebSocket: abierto. */
const SOCKET_OPEN = 1
/**
 * Código de cierre INTENCIONADO. Es imprescindible cerrar con un código
 * propio: un `close()` pelado se reporta como 1005 y el manejador de cierre
 * lo trataría como caída de red, reconectando para siempre (misma trampa que
 * documenta el SDK oficial).
 */
const CLOSE_INTENTIONAL = 3000
const RECONNECT_DELAY_MS = 1000

interface Subscription {
  gameIds: string[]
  onMessage: (message: unknown) => void
}

export function createAzuroLiveScoreClient(
  socketFactory: LiveScoreSocketFactory,
): AzuroLiveScoreClient {
  const subscriptions = new Set<Subscription>()
  /** Suscriptores por juego; decide cuándo enviar subscribe/unsubscribe. */
  const listenersPerGame = new Map<string, number>()
  let socket: LiveScoreSocketLike | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const sendAction = (action: 'subscribe' | 'unsubscribe', gameIds: string[]) => {
    if (socket === null || socket.readyState !== SOCKET_OPEN || gameIds.length === 0) {
      return
    }
    socket.send(JSON.stringify({ action, gameIds }))
  }

  const connect = () => {
    if (socket !== null) return
    const newSocket = socketFactory()
    socket = newSocket

    newSocket.addEventListener('open', () => {
      // Si mientras conectaba se fueron todos, no hay nada que suscribir y el
      // cierre de abajo ya está en marcha.
      sendAction('subscribe', [...listenersPerGame.keys()])
    })

    newSocket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      let message: unknown
      try {
        message = JSON.parse(event.data)
      } catch {
        return // un mensaje corrupto no tira las suscripciones
      }
      for (const sub of subscriptions) {
        sub.onMessage(message)
      }
    })

    newSocket.addEventListener('close', (event) => {
      if (socket !== newSocket) return
      socket = null
      // Caída de red con oyentes: reconectar y resuscribir (lo hace el `open`).
      if (event.code !== CLOSE_INTENTIONAL && subscriptions.size > 0) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          if (subscriptions.size > 0) connect()
        }, RECONNECT_DELAY_MS)
      }
    })
  }

  const disconnectIfIdle = () => {
    if (subscriptions.size > 0) return
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (socket !== null) {
      const current = socket
      socket = null
      current.close(CLOSE_INTENTIONAL)
    }
  }

  return {
    subscribe(gameIds, onMessage) {
      const sub: Subscription = { gameIds: [...new Set(gameIds)], onMessage }
      subscriptions.add(sub)

      const fresh: string[] = []
      for (const id of sub.gameIds) {
        const count = listenersPerGame.get(id) ?? 0
        listenersPerGame.set(id, count + 1)
        if (count === 0) fresh.push(id)
      }
      // Con el socket ya abierto solo se suscriben los juegos nuevos; si está
      // conectando (o aún no existe), el `open` suscribirá todos.
      sendAction('subscribe', fresh)
      connect()

      let done = false
      return () => {
        if (done) return // baja idempotente: React puede limpiar dos veces
        done = true
        subscriptions.delete(sub)
        const released: string[] = []
        for (const id of sub.gameIds) {
          const count = listenersPerGame.get(id) ?? 0
          if (count <= 1) {
            listenersPerGame.delete(id)
            released.push(id)
          } else {
            listenersPerGame.set(id, count - 1)
          }
        }
        // No desuscribir juegos con otros oyentes; los libres, sí.
        if (subscriptions.size > 0) sendAction('unsubscribe', released)
        disconnectIfIdle()
      }
    },
  }
}

/**
 * Cliente real para una cadena de Azuro. La URL sale de `chainsData` del
 * toolkit (constante verificada), nunca de una respuesta de API. El socket es
 * perezoso: no se abre nada hasta el primer suscriptor.
 */
export function createAzuroLiveScoreClientForChain(
  chainId: AzuroChainId,
): AzuroLiveScoreClient {
  const url = `${chainsData[chainId as ChainId].socket}/statistics/games`
  return createAzuroLiveScoreClient(() => new WebSocket(url))
}
