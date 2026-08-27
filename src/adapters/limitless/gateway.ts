/**
 * Frontera del adaptador con el mundo exterior de Limitless.
 *
 * Igual que en Azuro: todo lo que cruza la red o la wallet pasa por estas
 * interfaces; los tests inyectan fakes con fixtures. Los métodos de datos
 * devuelven `unknown` y `validate.ts` valida antes de mapear.
 *
 * Aquí no hay SDK: el SDK oficial arrastra ethers 6, axios y socket.io, que
 * duplicarían el stack web3 del proyecto (viem). La API REST está documentada
 * al completo (OpenAPI en docs.limitless.exchange/openapi.json) y basta con
 * `fetch` + viem.
 */
import {
  erc20Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { buildHmacHeaders } from './auth.ts'
import type { LimitlessConfig } from './config.ts'

// --- Órdenes ------------------------------------------------------------------

/** Cuerpo de la orden tal y como lo exige `POST /orders` (OpenAPI `Order`). */
export interface LimitlessSignedOrder {
  /** Entero decimal como string para no perder bytes de la firma. */
  salt: string
  maker: Address
  signer: Address
  taker: Address
  tokenId: string
  /** Unidades crudas de 6 decimales. Mínimo 100. */
  makerAmount: number
  takerAmount: number
  /** Debe representar cero; la API rechaza expiraciones reales. */
  expiration: string
  /** Debe ser el número 0. */
  nonce: 0
  /** Requerido en GTC/FAK: decimal con 3 cifras máximo, 0.01..0.99. */
  price: number
  feeRateBps: number
  /** 0 = comprar, 1 = vender. */
  side: 0 | 1
  signature: Hex
  /** 0 = firma EOA. */
  signatureType: 0
}

export interface CreateOrderPayload {
  order: LimitlessSignedOrder
  ownerId: number
  /** FAK: ejecuta lo que haya al precio protegido y cancela el resto. */
  orderType: 'FAK'
  marketSlug: string
}

/** Struct EIP-712 `Order` del exchange CTF de Limitless (doc oficial). */
export const LIMITLESS_ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const

export interface LimitlessOrderTypedData {
  account: Address
  domain: {
    name: 'Limitless CTF Exchange'
    version: '1'
    chainId: number
    verifyingContract: Address
  }
  types: typeof LIMITLESS_ORDER_TYPES
  primaryType: 'Order'
  message: {
    salt: bigint
    maker: Address
    signer: Address
    taker: Address
    tokenId: bigint
    makerAmount: bigint
    takerAmount: bigint
    expiration: bigint
    nonce: bigint
    feeRateBps: bigint
    side: number
    signatureType: number
  }
}

/** Construye el typed data EIP-712 que firma la wallet. Función pura. */
export function buildOrderTypedData(params: {
  account: Address
  chainId: number
  verifyingContract: Address
  order: Omit<LimitlessSignedOrder, 'signature' | 'signatureType' | 'price'>
}): LimitlessOrderTypedData {
  const { order } = params
  return {
    account: params.account,
    domain: {
      name: 'Limitless CTF Exchange',
      version: '1',
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: LIMITLESS_ORDER_TYPES,
    primaryType: 'Order',
    message: {
      salt: BigInt(order.salt),
      maker: order.maker,
      signer: order.signer,
      taker: order.taker,
      tokenId: BigInt(order.tokenId),
      makerAmount: BigInt(order.makerAmount),
      takerAmount: BigInt(order.takerAmount),
      expiration: BigInt(order.expiration),
      nonce: BigInt(order.nonce),
      feeRateBps: BigInt(order.feeRateBps),
      side: order.side,
      signatureType: 0,
    },
  }
}

// --- Pasarela HTTP ---------------------------------------------------------------

export interface ListActiveParams {
  tradeType: 'clob' | 'group'
  page: number
  limit: number
}

export interface SearchParams {
  query: string
  page: number
  limit: number
}

export interface LimitlessGateway {
  listActiveMarkets(params: ListActiveParams): Promise<unknown>
  searchMarkets(params: SearchParams): Promise<unknown>
  getMarket(slug: string): Promise<unknown>
  getOrderbook(slug: string): Promise<unknown>
  /** Requiere credenciales HMAC. */
  getMyProfile(): Promise<unknown>
  /** Requiere credenciales HMAC. */
  getPositions(): Promise<unknown>
  /** Requiere credenciales HMAC con alcance `trading`. */
  submitOrder(payload: CreateOrderPayload): Promise<unknown>
}

/** Error HTTP con el estado y el cuerpo, para que el adaptador lo clasifique. */
export class LimitlessHttpError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string, path: string) {
    super(`Limitless ${path} → HTTP ${status}`)
    this.name = 'LimitlessHttpError'
    this.status = status
    this.body = body
  }
}

/** Extrae el `message` del cuerpo de error de la API, si lo hay. */
export function limitlessErrorMessage(error: LimitlessHttpError): string | null {
  try {
    const parsed: unknown = JSON.parse(error.body)
    if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
      const message = (parsed as { message: unknown }).message
      if (typeof message === 'string') return message
      if (Array.isArray(message)) {
        const parts = message.filter((m): m is string => typeof m === 'string')
        if (parts.length > 0) return parts.join('; ')
      }
    }
  } catch {
    // Cuerpo no JSON: no hay mensaje que extraer.
  }
  return null
}

/** Implementación real contra la API REST, con firma HMAC donde toca. */
export function createLimitlessGateway(config: LimitlessConfig): LimitlessGateway {
  async function request(
    method: 'GET' | 'POST',
    pathWithQuery: string,
    options?: { body?: unknown; authenticated?: boolean },
  ): Promise<unknown> {
    const body = options?.body !== undefined ? JSON.stringify(options.body) : ''
    const headers: Record<string, string> = { Accept: 'application/json' }

    if (options?.authenticated) {
      if (config.auth === null) {
        throw new Error('Petición autenticada sin credenciales de Limitless')
      }
      Object.assign(
        headers,
        await buildHmacHeaders(config.auth, method, pathWithQuery, body),
      )
    }
    if (body !== '') headers['Content-Type'] = 'application/json'

    const response = await fetch(`${config.apiUrl}${pathWithQuery}`, {
      method,
      headers,
      ...(body !== '' ? { body } : {}),
    })
    if (!response.ok) {
      throw new LimitlessHttpError(
        response.status,
        (await response.text()).slice(0, 2000),
        pathWithQuery,
      )
    }
    return response.json() as Promise<unknown>
  }

  return {
    listActiveMarkets: ({ tradeType, page, limit }) =>
      request('GET', `/markets/active?limit=${limit}&page=${page}&tradeType=${tradeType}`),
    searchMarkets: ({ query, page, limit }) =>
      request(
        'GET',
        `/markets/search?query=${encodeURIComponent(query)}&limit=${limit}&page=${page}`,
      ),
    getMarket: (slug) => request('GET', `/markets/${encodeURIComponent(slug)}`),
    getOrderbook: (slug) =>
      request('GET', `/markets/${encodeURIComponent(slug)}/orderbook`),
    getMyProfile: () => request('GET', '/profiles/me', { authenticated: true }),
    getPositions: () => request('GET', '/portfolio/positions', { authenticated: true }),
    submitOrder: (payload) =>
      request('POST', '/orders', { body: payload, authenticated: true }),
  }
}

// --- Wallet ------------------------------------------------------------------------

/** Operaciones que exigen wallet. Separadas para poder operar sin ella. */
export interface LimitlessWalletBridge {
  /** Allowance actual del colateral (USDC) hacia el exchange del venue. */
  readAllowance(token: Address, owner: Address, spender: Address): Promise<bigint>
  /** Aprueba `amount` del colateral al exchange y espera la confirmación. */
  approve(token: Address, spender: Address, amount: bigint): Promise<void>
  /** Firma EIP-712 de la orden. */
  signOrderTypedData(typedData: LimitlessOrderTypedData): Promise<Hex>
}

/** Implementación real de la wallet sobre clientes viem. */
export function createViemLimitlessWalletBridge(
  publicClient: PublicClient,
  walletClient: WalletClient,
): LimitlessWalletBridge {
  return {
    async readAllowance(token, owner, spender) {
      return publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, spender],
      })
    },
    async approve(token, spender, amount) {
      const account = walletClient.account
      if (!account) throw new Error('La wallet no tiene cuenta activa')
      const hash = await walletClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amount],
        account,
        chain: walletClient.chain,
      })
      await publicClient.waitForTransactionReceipt({ hash })
    },
    async signOrderTypedData(typedData) {
      return walletClient.signTypedData(typedData)
    },
  }
}
