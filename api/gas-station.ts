/**
 * GASOLINERA: ejecuta meta-transacciones del USDT de Polygon pagando el gas
 * con una wallet propia, para que un usuario que solo tiene USDT (recién
 * depositado desde Binance) pueda apostar sin haber tenido POL jamás.
 *
 * Acepta EXACTAMENTE dos operaciones, firmadas EIP-712 por el usuario para
 * `executeMetaTransaction` del token (UChildERC20):
 *
 *   1. `transfer(gasolinera, peaje)` — el usuario paga el gas EN USDT.
 *   2. `approve(relayer de Azuro, ilimitado)` — lo que necesita para apostar.
 *
 * Nada más: cualquier otra función, destinatario o importe se rechaza. Las
 * firmas se verifican AQUÍ antes de gastar gas (una firma inválida revertiría
 * on-chain y el gas se perdería sin cobrar peaje). El peaje va primero y, si
 * su transacción falla, el approve no se envía.
 *
 * Entorno (en Vercel, sin prefijo VITE_: jamás llegan al navegador):
 *   - GAS_STATION_PRIVATE_KEY  clave de la wallet con el fondo de POL. Fondo
 *     PEQUEÑO a propósito (~20 POL): es una clave caliente.
 *   - GAS_STATION_TOLL_USDT    peaje en USDT (humano, p. ej. "0.10"). "0"
 *     desactiva el peaje. Por defecto 0.10.
 *   - GAS_STATION_RPC_URL      RPC de Polygon; por defecto publicnode.
 *
 * GET responde la configuración pública ({enabled, station, tollAmount…});
 * el cliente la usa para construir las firmas (src/adapters/azuro/gasStation.ts).
 */
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  erc20Abi,
  http,
  isAddress,
  maxUint256,
  pad,
  parseEther,
  parseUnits,
  recoverTypedDataAddress,
  toHex,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { polygon } from 'viem/chains'

/** USDT puenteado de Polygon: el token de apuesta de Azuro (6 decimales). */
const USDT: Address = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const USDT_DECIMALS = 6

/**
 * Relayer de Azuro en Polygon (chainsData del toolkit, verificado
 * 2026-09-06). Si Azuro lo cambia, el cliente enviará el nuevo y este
 * validador lo rechazará: actualizar aquí a la vez que el toolkit.
 */
const AZURO_RELAYER: Address = '0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d'

const CHAIN_ID = 137
const DEFAULT_RPC = 'https://polygon-bor-rpc.publicnode.com'
const DEFAULT_TOLL_USDT = '0.10'
/** Sin este mínimo de POL en la wallet, se rechaza en vez de fallar a medias. */
const MIN_STATION_GAS = parseEther('0.05')

const EXECUTE_META_TX_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'userAddress', type: 'address' },
      { internalType: 'bytes', name: 'functionSignature', type: 'bytes' },
      { internalType: 'bytes32', name: 'sigR', type: 'bytes32' },
      { internalType: 'bytes32', name: 'sigS', type: 'bytes32' },
      { internalType: 'uint8', name: 'sigV', type: 'uint8' },
    ],
    name: 'executeMetaTransaction',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
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

/** Lo que usamos de la firma clásica (req, res) del runtime Node de Vercel. */
interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  /** Puesto por los helpers de Vercel: objeto si era JSON, string si texto. */
  body?: unknown
}
interface VercelResponse {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): void
  send(body: string): void
}

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('content-type', 'application/json')
  res.status(status).send(JSON.stringify(body))
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

interface StationEnv {
  account: ReturnType<typeof privateKeyToAccount>
  toll: bigint
  rpcUrl: string
}

/** Configuración del entorno, o `null` si la gasolinera no está activada. */
function loadStation(): StationEnv | null {
  const rawKey = readEnv('GAS_STATION_PRIVATE_KEY')
  if (rawKey === undefined) return null
  const key = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex
  const account = privateKeyToAccount(key)
  const toll = parseUnits(
    readEnv('GAS_STATION_TOLL_USDT') ?? DEFAULT_TOLL_USDT,
    USDT_DECIMALS,
  )
  return { account, toll, rpcUrl: readEnv('GAS_STATION_RPC_URL') ?? DEFAULT_RPC }
}

interface IncomingMetaTx {
  functionSignature: Hex
  r: Hex
  s: Hex
  v: number
}

function isHex(value: unknown, bytes?: number): value is Hex {
  return (
    typeof value === 'string' &&
    /^0x[0-9a-fA-F]*$/.test(value) &&
    (bytes === undefined ? value.length > 2 : value.length === 2 + bytes * 2)
  )
}

function parseMetaTx(value: unknown): IncomingMetaTx | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (!isHex(record.functionSignature)) return null
  if (!isHex(record.r, 32) || !isHex(record.s, 32)) return null
  if (typeof record.v !== 'number' || (record.v !== 27 && record.v !== 28)) return null
  return {
    functionSignature: record.functionSignature,
    r: record.r,
    s: record.s,
    v: record.v,
  }
}

/** Clasificación de una operación permitida, tras decodificar el calldata. */
type AllowedCall =
  | { kind: 'toll'; amount: bigint }
  | { kind: 'approve' }

function classifyCall(
  data: Hex,
  station: Address,
  toll: bigint,
): AllowedCall | string {
  let decoded: { functionName: string; args: readonly unknown[] }
  try {
    const result = decodeFunctionData({ abi: erc20Abi, data })
    decoded = { functionName: result.functionName, args: result.args ?? [] }
  } catch {
    return 'la operación no es una función ERC-20 reconocible'
  }
  if (decoded.functionName === 'transfer') {
    const [to, amount] = decoded.args as [Address, bigint]
    if (to.toLowerCase() !== station.toLowerCase()) {
      return 'el destinatario del peaje no es la gasolinera'
    }
    if (amount < toll) return 'el peaje no cubre la tarifa'
    return { kind: 'toll', amount }
  }
  if (decoded.functionName === 'approve') {
    const [spender, amount] = decoded.args as [Address, bigint]
    if (spender.toLowerCase() !== AZURO_RELAYER.toLowerCase()) {
      return 'el approve no apunta al relayer de Azuro'
    }
    if (amount !== maxUint256) return 'el approve debe ser ilimitado'
    return { kind: 'approve' }
  }
  return `función no permitida: ${decoded.functionName}`
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  try {
    const station = loadStation()

    if (req.method === 'GET') {
      if (station === null) {
        sendJson(res, 200, { enabled: false })
        return
      }
      sendJson(res, 200, {
        enabled: true,
        station: station.account.address,
        tollAmount: station.toll.toString(),
        token: USDT,
        relayer: AZURO_RELAYER,
        chainId: CHAIN_ID,
      })
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { message: 'Método no soportado' })
      return
    }
    if (station === null) {
      sendJson(res, 503, { message: 'La gasolinera no está configurada' })
      return
    }

    const body =
      typeof req.body === 'string' ? (JSON.parse(req.body) as unknown) : req.body
    if (typeof body !== 'object' || body === null) {
      sendJson(res, 400, { message: 'Cuerpo inválido' })
      return
    }
    const { user, metaTxs } = body as { user?: unknown; metaTxs?: unknown }
    if (typeof user !== 'string' || !isAddress(user)) {
      sendJson(res, 400, { message: 'Dirección de usuario inválida' })
      return
    }
    if (!Array.isArray(metaTxs) || metaTxs.length < 1 || metaTxs.length > 2) {
      sendJson(res, 400, { message: 'Se esperan una o dos meta-transacciones' })
      return
    }
    const parsed: IncomingMetaTx[] = []
    for (const raw of metaTxs) {
      const metaTx = parseMetaTx(raw)
      if (metaTx === null) {
        sendJson(res, 400, { message: 'Meta-transacción malformada' })
        return
      }
      parsed.push(metaTx)
    }

    // Patrón exacto: [peaje, approve] con peaje activo; [approve] sin él.
    const calls = parsed.map((tx) =>
      classifyCall(tx.functionSignature, station.account.address, station.toll),
    )
    for (const call of calls) {
      if (typeof call === 'string') {
        sendJson(res, 400, { message: `Operación rechazada: ${call}` })
        return
      }
    }
    const kinds = (calls as AllowedCall[]).map((c) => c.kind).join(',')
    const expected = station.toll > 0n ? 'toll,approve' : 'approve'
    if (kinds !== expected) {
      sendJson(res, 400, {
        message: `Se esperaba el patrón [${expected}] y llegó [${kinds}]`,
      })
      return
    }

    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(station.rpcUrl),
    })
    const walletClient = createWalletClient({
      account: station.account,
      chain: polygon,
      transport: http(station.rpcUrl),
    })

    const [name, version, nonce, balance, allowance, stationGas] =
      await Promise.all([
        publicClient.readContract({
          address: USDT,
          abi: erc20Abi,
          functionName: 'name',
        }),
        publicClient
          .readContract({
            address: USDT,
            abi: EXECUTE_META_TX_ABI,
            functionName: 'ERC712_VERSION',
          })
          .catch(() => '1'),
        publicClient.readContract({
          address: USDT,
          abi: EXECUTE_META_TX_ABI,
          functionName: 'getNonce',
          args: [user],
        }),
        publicClient.readContract({
          address: USDT,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [user],
        }),
        publicClient.readContract({
          address: USDT,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [user, AZURO_RELAYER],
        }),
        publicClient.getBalance({ address: station.account.address }),
      ])

    if (stationGas < MIN_STATION_GAS) {
      sendJson(res, 503, {
        message: 'La gasolinera se quedó sin POL; avisa al anfitrión',
      })
      return
    }
    if (allowance >= maxUint256 / 2n) {
      sendJson(res, 409, { message: 'Ese usuario ya tiene el approve hecho' })
      return
    }
    if (balance < station.toll) {
      sendJson(res, 402, { message: 'Saldo USDT insuficiente para el peaje' })
      return
    }

    // Verificación de firmas ANTES de gastar gas. Nonces consecutivos, en el
    // orden de llegada (el peaje primero).
    const domain = {
      name,
      version,
      verifyingContract: USDT,
      salt: pad(toHex(CHAIN_ID), { size: 32 }),
    } as const
    for (const [i, tx] of parsed.entries()) {
      const signer = await recoverTypedDataAddress({
        domain,
        types: META_TX_TYPES,
        primaryType: 'MetaTransaction',
        message: {
          nonce: nonce + BigInt(i),
          from: user,
          functionSignature: tx.functionSignature,
        },
        signature: { r: tx.r, s: tx.s, v: BigInt(tx.v) },
      })
      if (signer.toLowerCase() !== user.toLowerCase()) {
        sendJson(res, 401, {
          message: `La firma ${i + 1} no es del usuario declarado`,
        })
        return
      }
    }

    // Ejecución en orden. El peaje va primero: si falla, no hay servicio.
    const hashes: Hex[] = []
    for (const tx of parsed) {
      const hash = await walletClient.writeContract({
        address: USDT,
        abi: EXECUTE_META_TX_ABI,
        functionName: 'executeMetaTransaction',
        args: [user, tx.functionSignature, tx.r, tx.s, tx.v],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        sendJson(res, 502, {
          message: 'Una meta-transacción revirtió on-chain',
          hashes: [...hashes, hash],
        })
        return
      }
      hashes.push(hash)
    }

    sendJson(res, 200, { hashes })
  } catch (error) {
    sendJson(res, 500, {
      message: error instanceof Error ? error.message : 'Error inesperado',
    })
  }
}
