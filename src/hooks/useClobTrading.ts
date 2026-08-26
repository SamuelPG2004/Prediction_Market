/**
 * Operativa real contra el CLOB de Polymarket.
 *
 * Cómo funciona de verdad, que no es como suele imaginarse:
 *
 *   1. Firmas un mensaje con tu wallet (L1 auth) para DERIVAR unas credenciales
 *      de API. No se envía nada a la cadena y no cuesta gas.
 *   2. Con esas credenciales firmas cada petición (L2 auth, HMAC).
 *   3. Cada orden se firma aparte como typed data EIP-712. Sigue siendo una
 *      firma tuya: nadie puede mover tus fondos sin ella.
 *   4. El operador de Polymarket empareja la orden y la liquida on-chain contra
 *      el CTFExchange.
 *
 * Es decir: NO se envía una transacción por compra. La transacción la manda el
 * operador. Lo que tú firmas es la orden. Por eso comprar no cuesta gas, pero
 * sí requiere las aprobaciones on-chain previas (ver useOnchainAccount).
 *
 * Se usa el SDK oficial @polymarket/clob-client, que en su v5 acepta
 * directamente un WalletClient de viem, así que encaja con wagmi sin adaptador.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import {
  ClobClient,
  OrderType,
  Side,
  type ApiKeyCreds,
} from '@polymarket/clob-client'
import { CLOB_API_BASE, POLYGON_CHAIN_ID } from '../config/polymarket'

/** Credenciales cacheadas por dirección, para no re-firmar en cada acción. */
const credsCache = new Map<string, ApiKeyCreds>()

export type TradeSide = 'buy' | 'sell'

export interface PlaceOrderInput {
  tokenId: string
  side: TradeSide
  /** En BUY: dólares a gastar. En SELL: shares a vender. */
  amount: number
  /**
   * Precio límite 0..1. Si se omite, se envía como orden de mercado (FOK).
   * Recomendado ponerlo siempre: sin límite aceptas cualquier precio del libro.
   */
  price?: number
  /** Si el mercado es negRisk (cambia el exchange y el dominio de firma). */
  negRisk?: boolean
}

export interface PlaceOrderResult {
  success: boolean
  orderId?: string
  status?: string
  /** Hashes de las transacciones on-chain de liquidación, si el operador las devuelve. */
  txHashes?: string[]
  error?: string
  /** true si el fallo parece de bloqueo geográfico o de cumplimiento. */
  blocked?: boolean
}

interface AuthState {
  status: 'idle' | 'authenticating' | 'ready' | 'error'
  error: string | null
}

export function useClobTrading() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: POLYGON_CHAIN_ID })
  const [auth, setAuth] = useState<AuthState>({ status: 'idle', error: null })
  const [isPlacing, setIsPlacing] = useState(false)
  const clientRef = useRef<ClobClient | null>(null)

  /** Cliente de solo lectura: no necesita firma ni credenciales. */
  const readClient = useMemo(
    () => new ClobClient(CLOB_API_BASE, POLYGON_CHAIN_ID),
    [],
  )

  const cacheKey = address?.toLowerCase() ?? ''

  /**
   * Obtiene un cliente autenticado, derivando las credenciales si hace falta.
   * Pide UNA firma la primera vez por dirección.
   */
  const getAuthedClient = useCallback(async (): Promise<ClobClient> => {
    if (!walletClient || !address) {
      throw new Error('Conecta tu wallet primero.')
    }

    const cached = credsCache.get(cacheKey)
    if (cached && clientRef.current) return clientRef.current

    setAuth({ status: 'authenticating', error: null })
    try {
      let creds = cached
      if (!creds) {
        // L1: firma un mensaje para derivar las credenciales de API.
        // deriveApiKey devuelve las existentes; createApiKey las crea si no hay.
        const bootstrap = new ClobClient(
          CLOB_API_BASE,
          POLYGON_CHAIN_ID,
          walletClient,
        )
        try {
          creds = await bootstrap.deriveApiKey()
        } catch {
          creds = await bootstrap.createApiKey()
        }
        if (!creds?.key) {
          throw new Error(
            'Polymarket no devolvió credenciales de API para esta wallet.',
          )
        }
        credsCache.set(cacheKey, creds)
      }

      const client = new ClobClient(
        CLOB_API_BASE,
        POLYGON_CHAIN_ID,
        walletClient,
        creds,
      )
      clientRef.current = client
      setAuth({ status: 'ready', error: null })
      return client
    } catch (e) {
      const msg = describeError(e)
      setAuth({ status: 'error', error: msg })
      throw new Error(msg)
    }
  }, [walletClient, address, cacheKey])

  /**
   * Firma y envía una orden.
   *
   * Con `price` se manda una orden límite GTC (queda en el libro si no cruza).
   * Sin `price` se manda de mercado FOK (se llena entera o se cancela), que
   * evita quedarte con un llenado parcial inesperado.
   */
  const placeOrder = useCallback(
    async (input: PlaceOrderInput): Promise<PlaceOrderResult> => {
      if (!isConnected) return { success: false, error: 'Wallet no conectada.' }
      if (!(input.amount > 0)) {
        return { success: false, error: 'El monto debe ser mayor que cero.' }
      }

      setIsPlacing(true)
      try {
        const client = await getAuthedClient()
        const side = input.side === 'buy' ? Side.BUY : Side.SELL
        const options = { negRisk: input.negRisk === true }

        let signed
        if (typeof input.price === 'number') {
          // Orden límite: `size` va en SHARES, así que en BUY hay que
          // convertir los dólares a shares al precio límite.
          const size =
            input.side === 'buy' ? input.amount / input.price : input.amount

          signed = await client.createOrder(
            {
              tokenID: input.tokenId,
              price: input.price,
              size,
              side,
            },
            options,
          )
        } else {
          // Orden de mercado: `amount` va en dólares (BUY) o shares (SELL).
          signed = await client.createMarketOrder(
            {
              tokenID: input.tokenId,
              amount: input.amount,
              side,
              orderType: OrderType.FOK,
            },
            options,
          )
        }

        const orderType =
          typeof input.price === 'number' ? OrderType.GTC : OrderType.FOK
        const res = await client.postOrder(signed, orderType)

        // La respuesta del CLOB no está fuertemente tipada; se lee defensivamente.
        const r = res as {
          success?: boolean
          errorMsg?: string
          error?: string
          orderID?: string
          orderId?: string
          status?: string
          transactionsHashes?: string[]
          transactionHashes?: string[]
        }

        const errMsg = r?.errorMsg || r?.error
        if (r?.success === false || (errMsg && !r?.orderID && !r?.orderId)) {
          return {
            success: false,
            error: errMsg || 'El CLOB rechazó la orden.',
            blocked: looksBlocked(errMsg),
          }
        }

        return {
          success: true,
          orderId: r?.orderID ?? r?.orderId,
          status: r?.status,
          txHashes: r?.transactionsHashes ?? r?.transactionHashes,
        }
      } catch (e) {
        const msg = describeError(e)
        return { success: false, error: msg, blocked: looksBlocked(msg) }
      } finally {
        setIsPlacing(false)
      }
    },
    [isConnected, getAuthedClient],
  )

  /** Órdenes tuyas aún abiertas en el libro. */
  const getOpenOrders = useCallback(async () => {
    const client = await getAuthedClient()
    return client.getOpenOrders()
  }, [getAuthedClient])

  const cancelOrder = useCallback(
    async (orderId: string) => {
      const client = await getAuthedClient()
      return client.cancelOrder({ orderID: orderId })
    },
    [getAuthedClient],
  )

  /** Historial de operaciones ejecutadas. */
  const getTrades = useCallback(async () => {
    const client = await getAuthedClient()
    return client.getTrades()
  }, [getAuthedClient])

  return {
    readClient,
    auth,
    isPlacing,
    isAuthenticated: auth.status === 'ready',
    authenticate: getAuthedClient,
    placeOrder,
    getOpenOrders,
    cancelOrder,
    getTrades,
  }
}

/** Convierte errores variados (axios, viem, Error) en un mensaje legible. */
function describeError(e: unknown): string {
  if (typeof e === 'string') return e

  const any = e as {
    shortMessage?: string
    response?: { status?: number; data?: unknown }
    message?: string
  }

  // Errores HTTP del CLOB (axios)
  const data = any?.response?.data
  if (data) {
    if (typeof data === 'string') return data
    const d = data as { error?: string; errorMsg?: string; message?: string }
    const m = d.error || d.errorMsg || d.message
    if (m) return m
  }
  const status = any?.response?.status
  if (status === 401 || status === 403) {
    return 'Polymarket rechazó la petición (401/403). Puede ser bloqueo geográfico o credenciales inválidas.'
  }

  // Rechazo de firma en la wallet (viem)
  if (any?.shortMessage) return any.shortMessage
  if (any?.message) return any.message
  return 'Error desconocido.'
}

/** Heurística para distinguir un bloqueo de cumplimiento de un error normal. */
function looksBlocked(msg?: string | null): boolean {
  if (!msg) return false
  const m = msg.toLowerCase()
  return (
    m.includes('geo') ||
    m.includes('region') ||
    m.includes('jurisdiction') ||
    m.includes('blocked') ||
    m.includes('restricted') ||
    m.includes('not available') ||
    m.includes('403')
  )
}
