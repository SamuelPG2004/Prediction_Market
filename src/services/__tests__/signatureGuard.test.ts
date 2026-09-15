/**
 * Tests de la puerta de firma: es lo que impide que una dependencia
 * comprometida, el widget de bridge o una XSS firmen una transferencia sin
 * que el usuario vea nada. Sin red y sin navegador: la cuenta es una clave
 * de juguete y la cola se maneja a mano.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeFunctionData, erc20Abi, maxUint256, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  conPuertaDeFirma,
  olvidarDireccionesConocidas,
  puertaDeFirma,
  registrarDireccionesConocidas,
  FIRMA_TIMEOUT_MS,
} from '../signatureGuard.ts'

/** Clave de juguete, nunca usada fuera de estos tests. */
const CLAVE = `0x${'11'.repeat(32)}` as const
const USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as Address
const RELAYER = '0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d' as Address
const DESCONOCIDO = '0x00000000000000000000000000000000deadbeef' as Address

const cruda = privateKeyToAccount(CLAVE)

/** Espera a que la cola tenga una petición (la firma es asíncrona). */
async function esperarPeticion() {
  for (let i = 0; i < 50; i++) {
    const actual = puertaDeFirma.actual()
    if (actual !== null) return actual
    await Promise.resolve()
  }
  throw new Error('no llegó ninguna petición a la cola')
}

beforeEach(() => {
  registrarDireccionesConocidas([
    [USDT, { etiqueta: 'USDT de Azuro', token: { symbol: 'USDT', decimals: 6 } }],
    [RELAYER, { etiqueta: 'relayer de Azuro' }],
  ])
})

afterEach(() => {
  puertaDeFirma.rechazarTodas('fin del test')
  olvidarDireccionesConocidas()
  vi.useRealTimers()
})

describe('cobertura de la puerta', () => {
  it('envuelve TODAS las operaciones de firma que expone viem', () => {
    // Guardia de futuro: si viem añade otra operación `sign*`, este test la
    // detecta en vez de dejar un agujero silencioso por el que firmar.
    const operaciones = Object.keys(cruda).filter((clave) => clave.startsWith('sign'))
    expect(operaciones.sort()).toEqual([
      'sign',
      'signAuthorization',
      'signMessage',
      'signTransaction',
      'signTypedData',
    ])

    const guardada = conPuertaDeFirma(cruda)
    for (const operacion of operaciones) {
      const propia = guardada[operacion as keyof typeof guardada]
      const original = cruda[operacion as keyof typeof cruda]
      expect(typeof propia).toBe('function')
      expect(propia).not.toBe(original)
    }
  })

  it('no altera la identidad de la cuenta', () => {
    const guardada = conPuertaDeFirma(cruda)
    expect(guardada.address).toBe(cruda.address)
    expect(guardada.publicKey).toBe(cruda.publicKey)
    expect(guardada.type).toBe('local')
  })
})

describe('aprobar y rechazar', () => {
  it('no firma nada hasta que un humano aprueba', async () => {
    const guardada = conPuertaDeFirma(cruda)
    let firmado: string | null = null
    const promesa = guardada.signMessage({ message: 'hola' }).then((f) => (firmado = f))

    const peticion = await esperarPeticion()
    // Momento clave: la petición existe y la firma NO se ha producido.
    expect(firmado).toBeNull()

    puertaDeFirma.aprobar(peticion.id)
    await promesa
    expect(firmado).toBe(await cruda.signMessage({ message: 'hola' }))
    expect(puertaDeFirma.actual()).toBeNull()
  })

  it('al rechazar lanza el error que los adaptadores ya entienden', async () => {
    const guardada = conPuertaDeFirma(cruda)
    const promesa = guardada.signMessage({ message: 'hola' })
    const peticion = await esperarPeticion()
    puertaDeFirma.rechazar(peticion.id)

    // `walletFail` del AzuroAdapter reconoce este nombre y lo traduce a
    // "Has cancelado la firma en la wallet".
    await expect(promesa).rejects.toMatchObject({ name: 'UserRejectedRequestError' })
  })

  it('rechazarTodas tira la cola entera (bóveda bloqueada)', async () => {
    const guardada = conPuertaDeFirma(cruda)
    const primera = guardada.signMessage({ message: 'una' })
    const segunda = guardada.signMessage({ message: 'dos' })
    await esperarPeticion()
    expect(puertaDeFirma.pendientes()).toBe(2)

    puertaDeFirma.rechazarTodas('La wallet se bloqueó antes de firmar')

    await expect(primera).rejects.toMatchObject({ name: 'UserRejectedRequestError' })
    await expect(segunda).rejects.toMatchObject({ name: 'UserRejectedRequestError' })
    expect(puertaDeFirma.actual()).toBeNull()
  })

  it('las peticiones se atienden en orden y sin mezclarse', async () => {
    const guardada = conPuertaDeFirma(cruda)
    const primera = guardada.signMessage({ message: 'una' })
    const segunda = guardada.signMessage({ message: 'dos' })
    await esperarPeticion()

    const [uno, dos] = [puertaDeFirma.actual()!.id, puertaDeFirma.pendientes()]
    expect(dos).toBe(2)

    puertaDeFirma.rechazar(uno)
    await expect(primera).rejects.toThrow()
    // La segunda sigue esperando su propia decisión.
    expect(puertaDeFirma.pendientes()).toBe(1)
    puertaDeFirma.aprobar(puertaDeFirma.actual()!.id)
    await expect(segunda).resolves.toMatch(/^0x/)
  })

  it('caduca sola si nadie responde', async () => {
    vi.useFakeTimers()
    const guardada = conPuertaDeFirma(cruda)
    // El catch se engancha YA: con temporizadores falsos, el rechazo ocurre
    // dentro de advanceTimers y sin handler sería una rejection no capturada.
    const resultado = guardada.signMessage({ message: 'hola' }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(0)
    expect(puertaDeFirma.actual()).not.toBeNull()

    await vi.advanceTimersByTimeAsync(FIRMA_TIMEOUT_MS + 1000)
    expect(await resultado).toMatchObject({ name: 'UserRejectedRequestError' })
    expect(puertaDeFirma.actual()).toBeNull()
  })
})

describe('qué se le enseña al usuario', () => {
  /** Lanza la operación, devuelve la petición y la deja rechazada. */
  async function describir(operacion: () => Promise<unknown>) {
    const promesa = operacion().catch(() => undefined)
    const peticion = await esperarPeticion()
    puertaDeFirma.rechazar(peticion.id)
    await promesa
    return peticion
  }

  const guardada = () => conPuertaDeFirma(cruda)

  it('traduce una transferencia de token a importe y destinatario', async () => {
    const peticion = await describir(() =>
      guardada().signTransaction({
        to: USDT,
        chainId: 137,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [DESCONOCIDO, 5_000_000n],
        }),
      }),
    )

    expect(peticion.titulo).toBe('Enviar tokens')
    const valores = Object.fromEntries(peticion.detalles.map((d) => [d.etiqueta, d.valor]))
    expect(valores['Envías']).toBe('5 USDT')
    // viem devuelve la dirección en checksum; lo que importa es que se
    // enseñe abreviada y reconocible.
    expect(valores['A']?.toLowerCase()).toContain('0x0000…beef')
    expect(valores['Red']).toBe('Polygon')
    expect(peticion.riesgo).toBe('normal')
  })

  it('marca como alto riesgo el approve ilimitado y nombra al gastador', async () => {
    const peticion = await describir(() =>
      guardada().signTransaction({
        to: USDT,
        chainId: 137,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [RELAYER, maxUint256],
        }),
      }),
    )

    expect(peticion.titulo).toBe('Autorizar gasto')
    expect(peticion.riesgo).toBe('alto')
    const valores = Object.fromEntries(peticion.detalles.map((d) => [d.etiqueta, d.valor]))
    expect(valores['Autorizas a']).toContain('relayer de Azuro')
    expect(valores['Hasta']).toBe('ILIMITADO')
  })

  it('abre la meta-transacción de la gasolinera y describe lo de dentro', async () => {
    // Lo que el usuario firma es un MetaTransaction opaco; lo que de verdad
    // autoriza está en `functionSignature`. Si esto dejara de abrirse, el
    // diálogo enseñaría un hexadecimal y el peaje pasaría sin verse.
    const peticion = await describir(() =>
      guardada().signTypedData({
        domain: { name: 'USDT0', version: '1', verifyingContract: USDT },
        types: {
          MetaTransaction: [
            { name: 'nonce', type: 'uint256' },
            { name: 'from', type: 'address' },
            { name: 'functionSignature', type: 'bytes' },
          ],
        },
        primaryType: 'MetaTransaction',
        message: {
          nonce: 0n,
          from: cruda.address,
          functionSignature: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [DESCONOCIDO, 100_000n],
          }),
        },
      }),
    )

    expect(peticion.titulo).toBe('Enviar tokens (sin gas)')
    const valores = Object.fromEntries(peticion.detalles.map((d) => [d.etiqueta, d.valor]))
    expect(valores['Envías']).toBe('0.1 USDT')
    expect(peticion.resumen).toContain('gasolinera')
  })

  it('avisa cuando no puede saber qué autoriza el calldata', async () => {
    const peticion = await describir(() =>
      guardada().signTransaction({ to: DESCONOCIDO, chainId: 137, data: '0xdeadbeef' }),
    )
    expect(peticion.riesgo).toBe('alto')
    expect(peticion.resumen).toContain('no reconoce')
  })

  it('trata la firma de un hash suelto como alto riesgo', async () => {
    const peticion = await describir(() => guardada().sign({ hash: `0x${'ab'.repeat(32)}` }))
    expect(peticion.riesgo).toBe('alto')
    expect(peticion.titulo).toContain('crudo')
  })

  it('trata la delegación EIP-7702 como alto riesgo', async () => {
    const peticion = await describir(() =>
      guardada().signAuthorization({ address: DESCONOCIDO, chainId: 137, nonce: 0 }),
    )
    expect(peticion.riesgo).toBe('alto')
    expect(peticion.titulo).toContain('Delegar')
  })

  it('un importe de token desconocido se enseña en unidades mínimas, sin inventar', async () => {
    olvidarDireccionesConocidas()
    const peticion = await describir(() =>
      guardada().signTransaction({
        to: DESCONOCIDO,
        chainId: 137,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [RELAYER, 5_000_000n],
        }),
      }),
    )
    const valores = Object.fromEntries(peticion.detalles.map((d) => [d.etiqueta, d.valor]))
    expect(valores['Envías']).toBe('5000000 (unidades mínimas)')
  })
})
