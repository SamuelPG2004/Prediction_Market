/**
 * Approve SIN GAS del token de apuesta hacia el relayer de Azuro, vía la
 * "gasolinera" propia (`api/gas-station.ts` en Vercel).
 *
 * El USDT de Polygon (UChildERC20) soporta meta-transacciones nativas: el
 * usuario firma EIP-712 con `executeMetaTransaction` en mente y OTRO envía la
 * transacción pagando el gas. Aquí el usuario firma dos operaciones:
 *
 *   1. `transfer(gasolinera, peaje)` — paga la comisión de gas EN USDT.
 *   2. `approve(relayer, ilimitado)` — la autorización que necesita apostar.
 *
 * y la gasolinera las ejecuta con su propio POL. Resultado: una wallet con
 * solo USDT (recién depositado desde Binance) puede apostar sin haber tenido
 * POL jamás.
 *
 * El dominio EIP-712 del token se lee ON-CHAIN en cada uso (name() y
 * ERC712_VERSION()): Tether ya lo cambió una vez ("(PoS) Tether USD" →
 * "USDT0" en la migración de 2025) y un valor fijado aquí rompería en la
 * siguiente. `salt` = chainId en bytes32, como define UChildERC20 (NO lleva
 * campo chainId).
 *
 * Cualquier fallo devuelve `false` y el llamante cae al approve on-chain
 * clásico: la gasolinera es una mejora, nunca un bloqueo.
 */
import {
  encodeFunctionData,
  erc20Abi,
  isAddress,
  maxUint256,
  pad,
  parseSignature,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'

const GAS_STATION_ENDPOINT = '/api/gas-station'

/** Única cadena con gasolinera: Polygon (meta-tx del USDT puenteado). */
const SUPPORTED_CHAIN_ID = 137

/** Funciones del UChildERC20 que no están en el ABI ERC-20 estándar. */
const META_TX_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getNonce',
    outputs: [{ internalType: 'uint256', name: 'nonce', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'ERC712_VERSION',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const META_TX_TYPES = {
  MetaTransaction: [
    { name: 'nonce', type: 'uint256' },
    { name: 'from', type: 'address' },
    { name: 'functionSignature', type: 'bytes' },
  ],
} as const

interface GasStationInfo {
  station: Address
  tollAmount: bigint
}

/** Meta-transacción firmada, tal y como la espera el endpoint. */
export interface SignedMetaTx {
  functionSignature: Hex
  r: Hex
  s: Hex
  v: number
}

/**
 * Configuración de la gasolinera, o `null` si no está desplegada/activada.
 * En dev (`npm run dev`) no existe el endpoint y Vite responde el index.html:
 * el parseo JSON falla y se devuelve `null` — desactivada, sin error.
 */
async function fetchGasStationInfo(): Promise<GasStationInfo | null> {
  let data: unknown
  try {
    const res = await fetch(GAS_STATION_ENDPOINT, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    data = await res.json()
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  if (record.enabled !== true) return null
  const station = record.station
  const tollAmount = record.tollAmount
  if (typeof station !== 'string' || !isAddress(station)) return null
  if (typeof tollAmount !== 'string') return null
  let toll: bigint
  try {
    toll = BigInt(tollAmount)
  } catch {
    return null
  }
  if (toll < 0n) return null
  return { station, tollAmount: toll }
}

export interface GaslessApproveParams {
  publicClient: PublicClient
  walletClient: WalletClient
  token: Address
  owner: Address
  spender: Address
}

/**
 * Intenta el approve ilimitado `owner → spender` sin gas. Devuelve `true` si
 * la gasolinera lo ejecutó (confirmado on-chain en el servidor) y `false` si
 * no está disponible o algo falló — el llamante decide el plan B.
 */
export async function tryGaslessApprove({
  publicClient,
  walletClient,
  token,
  owner,
  spender,
}: GaslessApproveParams): Promise<boolean> {
  const chainId = walletClient.chain?.id ?? publicClient.chain?.id
  if (chainId !== SUPPORTED_CHAIN_ID) return false

  const info = await fetchGasStationInfo()
  if (info === null) return false

  try {
    const [name, version, nonce, balance] = await Promise.all([
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'name',
      }),
      publicClient
        .readContract({
          address: token,
          abi: META_TX_ABI,
          functionName: 'ERC712_VERSION',
        })
        .catch(() => '1'),
      publicClient.readContract({
        address: token,
        abi: META_TX_ABI,
        functionName: 'getNonce',
        args: [owner],
      }),
      publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      }),
    ])

    // Sin saldo para el peaje no hay servicio; que decida el plan B.
    if (balance < info.tollAmount) return false

    const domain = {
      name,
      version,
      verifyingContract: token,
      salt: pad(toHex(chainId), { size: 32 }),
    } as const

    const calls: Hex[] = []
    if (info.tollAmount > 0n) {
      calls.push(
        encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [info.station, info.tollAmount],
        }),
      )
    }
    calls.push(
      encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, maxUint256],
      }),
    )

    // Los nonces de meta-tx son consecutivos: la primera usa el actual y la
    // segunda el siguiente; el servidor las ejecuta en este mismo orden.
    const metaTxs: SignedMetaTx[] = []
    for (const [i, functionSignature] of calls.entries()) {
      const signature = await walletClient.signTypedData({
        account: owner,
        domain,
        types: META_TX_TYPES,
        primaryType: 'MetaTransaction',
        message: {
          nonce: nonce + BigInt(i),
          from: owner,
          functionSignature,
        },
      })
      const { r, s, v, yParity } = parseSignature(signature)
      metaTxs.push({
        functionSignature,
        r,
        s,
        v: v !== undefined ? Number(v) : yParity + 27,
      })
    }

    const res = await fetch(GAS_STATION_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: owner, metaTxs }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.warn(`Gasolinera rechazó el approve sin gas (${res.status}): ${detail}`)
      return false
    }
    return true
  } catch (error) {
    console.warn('Approve sin gas fallido; se intentará on-chain.', error)
    return false
  }
}
