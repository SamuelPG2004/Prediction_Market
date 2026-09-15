/**
 * Tests del techo de peaje de la gasolinera.
 *
 * El importe del peaje lo anuncia el SERVIDOR y la bóveda local lo firma sin
 * diálogo de wallet: si el cliente no pusiera su propio techo, un valor
 * absurdo (variable mal puesta en Vercel, despliegue comprometido) se firmaría
 * como un `transfer` del saldo entero sin que el usuario viese nada. Aquí se
 * comprueba que ese caso ni siquiera llega a la fase de firma.
 *
 * Sin red: `fetch` se sustituye por un doble que devuelve la config elegida.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicClient, WalletClient } from 'viem'
import { tryGaslessApprove } from '../gasStation.ts'

const TOKEN = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as const
const OWNER = '0x1111111111111111111111111111111111111111' as const
const SPENDER = '0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d' as const
const STATION = '0x12511B1E7A22FFFD2fbccBd6C86b5aB689464883' as const

/** Doble de `fetch` que responde la config pública de la gasolinera. */
function stubGasStation(tollAmount: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({ enabled: true, station: STATION, tollAmount }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  )
}

/** Clientes mínimos: basta con que la cadena sea Polygon y se pueda espiar. */
function makeClients() {
  const signTypedData = vi.fn()
  // Las lecturas on-chain revientan a propósito: lo único que importa es SI
  // se llega a ellas (peaje aceptado) o no (peaje rechazado antes).
  const readContract = vi.fn(async () => {
    throw new Error('sin cadena en los tests')
  })
  return {
    signTypedData,
    readContract,
    publicClient: { readContract } as unknown as PublicClient,
    walletClient: { chain: { id: 137 }, signTypedData } as unknown as WalletClient,
  }
}

function approve(clients: ReturnType<typeof makeClients>) {
  return tryGaslessApprove({
    publicClient: clients.publicClient,
    walletClient: clients.walletClient,
    token: TOKEN,
    owner: OWNER,
    spender: SPENDER,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('tryGaslessApprove: techo del peaje', () => {
  it('rechaza un peaje por encima del techo sin firmar ni tocar la cadena', async () => {
    // 1000 USDT: el ataque que el techo existe para parar.
    stubGasStation('1000000000')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clients = makeClients()

    expect(await approve(clients)).toBe(false)
    expect(clients.signTypedData).not.toHaveBeenCalled()
    expect(clients.readContract).not.toHaveBeenCalled()
  })

  it('acepta el peaje real de hoy (0,10 USDT) y sigue adelante', async () => {
    stubGasStation('100000')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clients = makeClients()

    // Devuelve false porque las lecturas on-chain fallan en el test, pero
    // haberlas intentado prueba que la config pasó el filtro.
    expect(await approve(clients)).toBe(false)
    expect(clients.readContract).toHaveBeenCalled()
  })

  it('acepta el peaje justo en el techo (0,50 USDT)', async () => {
    stubGasStation('500000')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clients = makeClients()

    await approve(clients)
    expect(clients.readContract).toHaveBeenCalled()
  })

  it('rechaza un peaje un paso por encima del techo', async () => {
    stubGasStation('500001')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clients = makeClients()

    expect(await approve(clients)).toBe(false)
    expect(clients.readContract).not.toHaveBeenCalled()
  })
})
