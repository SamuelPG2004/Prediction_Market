/**
 * PUERTA DE FIRMA de la wallet local.
 *
 * Una wallet de extensión enseña un diálogo antes de cada firma; la bóveda de
 * la app no lo hacía: entregaba una cuenta de viem con la clave ya
 * desbloqueada, así que CUALQUIER código de la página (una dependencia
 * comprometida, el widget de bridge, una XSS) podía firmar una transferencia
 * sin que el usuario viera nada. Este módulo es ese diálogo.
 *
 * Punto de estrangulamiento: la bóveda no entrega nunca la cuenta cruda, sino
 * una envuelta por `conPuertaDeFirma`, que intercepta las CINCO operaciones
 * que producen una firma (`sign`, `signMessage`, `signTypedData`,
 * `signTransaction`, `signAuthorization`) y espera el visto bueno humano. No
 * hay puerta trasera ni modo "confiar en esta sesión": la única forma de sacar
 * material firmante de la bóveda sigue siendo `revealPrivateKey`, que pide la
 * contraseña.
 *
 * Si una versión futura de viem añade otra operación de firma, el test
 * "cubre todas las operaciones de firma de viem" falla: se envuelve por
 * enumeración de claves `sign*`, no por confianza.
 *
 * Rechazar lanza `UserRejectedRequestError` de viem, que es justo lo que ya
 * reconocen los adaptadores (`walletFail` → "Has cancelado la firma").
 */
import {
  UserRejectedRequestError,
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  maxUint256,
  type Address,
  type Hex,
} from 'viem'
import type { PrivateKeyAccount } from 'viem/accounts'
import { chainLabel } from '../config/chains'

/** Sin respuesta humana en este tiempo, la petición se rechaza sola. */
export const FIRMA_TIMEOUT_MS = 3 * 60_000

/** Una línea del diálogo: "Envías" → "5 USDT". */
export interface DetalleFirma {
  etiqueta: string
  valor: string
  /** Lo que de verdad importa para decidir (importes, destinatarios). */
  destacado?: boolean
}

export type RiesgoFirma = 'normal' | 'alto'

/** Lo que la UI necesita para que un humano decida con criterio. */
export interface PeticionDeFirma {
  id: number
  /** Qué operación es, en dos o tres palabras. */
  titulo: string
  /** Una frase: qué autoriza esto exactamente. */
  resumen: string
  detalles: DetalleFirma[]
  /** Lo que se firma, literal, para quien quiera auditarlo. */
  crudo: string
  /**
   * 'alto' cuando la app no puede acotar qué autoriza la firma (un hash suelto,
   * una delegación EIP-7702, un approve ilimitado): el diálogo lo avisa.
   */
  riesgo: RiesgoFirma
}

// --- Direcciones conocidas ----------------------------------------------------

export interface DireccionConocida {
  etiqueta: string
  /** Solo tokens: permite enseñar "5 USDT" en vez de "5000000". */
  token?: { symbol: string; decimals: number }
}

const conocidas = new Map<string, DireccionConocida>()

/**
 * Registra direcciones con nombre para que el diálogo diga "el relayer de
 * Azuro" en vez de un hexadecimal que nadie puede verificar de un vistazo.
 * Lo llama el punto de composición de venues (services/marketSources.ts):
 * este módulo no conoce ningún venue.
 */
export function registrarDireccionesConocidas(
  entradas: Iterable<readonly [Address, DireccionConocida]>,
): void {
  for (const [address, info] of entradas) conocidas.set(address.toLowerCase(), info)
}

/** Solo para tests. */
export function olvidarDireccionesConocidas(): void {
  conocidas.clear()
}

function conocida(address: string): DireccionConocida | undefined {
  return conocidas.get(address.toLowerCase())
}

function abreviar(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** "USDT (0xc213…8e8F)" si se conoce; si no, la dirección abreviada. */
function etiquetaDe(address: string): string {
  const info = conocida(address)
  return info === undefined
    ? abreviar(address)
    : `${info.etiqueta} (${abreviar(address)})`
}

/** Importe de un token: humano si sabemos sus decimales, crudo si no. */
function importeDeToken(token: string | undefined, cantidad: bigint): string {
  if (cantidad === maxUint256) return 'ILIMITADO'
  const info = token === undefined ? undefined : conocida(token)?.token
  if (info === undefined) return `${cantidad} (unidades mínimas)`
  return `${formatUnits(cantidad, info.decimals)} ${info.symbol}`
}

// --- Descripción de lo que se va a firmar -------------------------------------

/** JSON legible con bigints y sin reventar por referencias raras. */
function aJson(valor: unknown): string {
  return JSON.stringify(
    valor,
    (_clave, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  )
}

const APPROVAL_FOR_ALL_ABI = [
  {
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

interface LlamadaDescrita {
  titulo: string
  resumen: string
  detalles: DetalleFirma[]
  riesgo: RiesgoFirma
}

/**
 * Traduce el calldata de las operaciones que esta app hace de verdad
 * (transferir, aprobar gasto, aprobar el NFT de la apuesta). Lo que no se
 * reconoce se enseña como tal, nunca se adorna: un calldata opaco es
 * justamente lo que el usuario debe mirar con recelo.
 */
function describirLlamada(contrato: string, data: Hex | undefined): LlamadaDescrita | null {
  if (data === undefined || data === '0x') return null

  try {
    const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data })
    if (functionName === 'transfer') {
      const [destino, cantidad] = args as [Address, bigint]
      return {
        titulo: 'Enviar tokens',
        resumen: `Sacas ${importeDeToken(contrato, cantidad)} de tu wallet.`,
        detalles: [
          { etiqueta: 'Envías', valor: importeDeToken(contrato, cantidad), destacado: true },
          { etiqueta: 'A', valor: etiquetaDe(destino), destacado: true },
          { etiqueta: 'Token', valor: etiquetaDe(contrato) },
        ],
        riesgo: 'normal',
      }
    }
    if (functionName === 'approve') {
      const [gastador, cantidad] = args as [Address, bigint]
      const ilimitado = cantidad === maxUint256
      return {
        titulo: 'Autorizar gasto',
        resumen: ilimitado
          ? 'Autorizas a gastar TODO tu saldo de este token, ahora y en el futuro, sin volver a preguntarte.'
          : `Autorizas a gastar hasta ${importeDeToken(contrato, cantidad)} de tu saldo.`,
        detalles: [
          { etiqueta: 'Autorizas a', valor: etiquetaDe(gastador), destacado: true },
          { etiqueta: 'Hasta', valor: importeDeToken(contrato, cantidad), destacado: true },
          { etiqueta: 'Token', valor: etiquetaDe(contrato) },
        ],
        riesgo: ilimitado ? 'alto' : 'normal',
      }
    }
  } catch {
    // No era ERC-20; se prueba el siguiente ABI.
  }

  try {
    const { args } = decodeFunctionData({ abi: APPROVAL_FOR_ALL_ABI, data })
    const [operador, aprobado] = args as [Address, boolean]
    return {
      titulo: aprobado ? 'Autorizar tus apuestas' : 'Retirar autorización',
      resumen: aprobado
        ? 'Autorizas a mover TODAS tus apuestas (los NFT de este contrato), no solo una.'
        : 'Retiras la autorización sobre tus apuestas.',
      detalles: [
        { etiqueta: aprobado ? 'Autorizas a' : 'Retiras a', valor: etiquetaDe(operador), destacado: true },
        { etiqueta: 'Contrato', valor: etiquetaDe(contrato) },
      ],
      riesgo: aprobado ? 'alto' : 'normal',
    }
  } catch {
    // Tampoco; se describe en crudo.
  }

  return {
    titulo: 'Llamada a un contrato',
    resumen:
      'La app no reconoce esta operación, así que no puede decirte qué autoriza. Si no la esperabas, recházala.',
    detalles: [
      { etiqueta: 'Contrato', valor: etiquetaDe(contrato), destacado: true },
      { etiqueta: 'Función', valor: `selector ${data.slice(0, 10)}` },
    ],
    riesgo: 'alto',
  }
}

interface TransaccionFirmable {
  to?: string | null
  value?: bigint
  data?: Hex
  chainId?: number
}

function describirTransaccion(tx: TransaccionFirmable): Omit<PeticionDeFirma, 'id'> {
  const detallesRed: DetalleFirma[] =
    tx.chainId === undefined ? [] : [{ etiqueta: 'Red', valor: chainLabel(tx.chainId) }]
  const destino = typeof tx.to === 'string' ? tx.to : null
  const llamada = destino === null ? null : describirLlamada(destino, tx.data)
  const crudo = aJson({ to: tx.to, value: tx.value, data: tx.data, chainId: tx.chainId })

  if (llamada !== null) {
    return {
      titulo: llamada.titulo,
      resumen: llamada.resumen,
      detalles: [...llamada.detalles, ...detallesRed],
      crudo,
      riesgo: llamada.riesgo,
    }
  }

  // Sin calldata: envío de moneda nativa (POL, ETH, BNB).
  const valor = tx.value ?? 0n
  return {
    titulo: 'Enviar moneda de la red',
    resumen: `Sacas ${formatUnits(valor, 18)} de la moneda nativa de tu wallet.`,
    detalles: [
      { etiqueta: 'Envías', valor: `${formatUnits(valor, 18)} (moneda nativa)`, destacado: true },
      { etiqueta: 'A', valor: destino === null ? 'creación de contrato' : etiquetaDe(destino), destacado: true },
      ...detallesRed,
    ],
    crudo,
    riesgo: destino === null ? 'alto' : 'normal',
  }
}

interface TypedDataFirmable {
  domain?: { name?: string; chainId?: number; verifyingContract?: string } | undefined
  primaryType: string
  message?: Record<string, unknown>
}

function describirTypedData(params: TypedDataFirmable): Omit<PeticionDeFirma, 'id'> {
  const dominio = params.domain ?? {}
  const contrato = dominio.verifyingContract
  const crudo = aJson({
    domain: dominio,
    primaryType: params.primaryType,
    message: params.message,
  })
  const detallesDominio: DetalleFirma[] = [
    ...(dominio.name === undefined ? [] : [{ etiqueta: 'Contrato', valor: dominio.name }]),
    ...(contrato === undefined ? [] : [{ etiqueta: 'Dirección', valor: etiquetaDe(contrato) }]),
    ...(dominio.chainId === undefined ? [] : [{ etiqueta: 'Red', valor: chainLabel(dominio.chainId) }]),
  ]

  // Meta-transacción del token (gasolinera): lo que de verdad se autoriza va
  // dentro de `functionSignature`, así que se abre y se describe eso.
  const interna = params.message?.functionSignature
  if (params.primaryType === 'MetaTransaction' && typeof interna === 'string') {
    const llamada = describirLlamada(contrato ?? '', interna as Hex)
    if (llamada !== null) {
      return {
        titulo: `${llamada.titulo} (sin gas)`,
        resumen: `${llamada.resumen} La envía la gasolinera pagando el gas por ti; tú no gastas POL.`,
        detalles: [...llamada.detalles, ...detallesDominio],
        crudo,
        riesgo: llamada.riesgo,
      }
    }
  }

  // Resto de firmas EIP-712 (apuesta, cash out, orden de Limitless): se
  // enseñan sus campos tal cual. No se inventa una traducción que podría
  // mentir si el venue cambia el formato.
  const campos = Object.entries(params.message ?? {}).map(([etiqueta, valor]) => ({
    etiqueta,
    valor: typeof valor === 'object' && valor !== null ? aJson(valor) : String(valor),
  }))
  return {
    titulo: `Firmar orden: ${params.primaryType}`,
    resumen:
      'Firmas una orden que el servicio ejecutará en tu nombre. Revisa los campos y la red.',
    detalles: [...campos, ...detallesDominio],
    crudo,
    riesgo: 'normal',
  }
}

// --- La cola ------------------------------------------------------------------

interface EnCola {
  peticion: PeticionDeFirma
  resolver: () => void
  rechazar: (motivo: Error) => void
  temporizador: ReturnType<typeof setTimeout>
}

function rechazoDelUsuario(detalle: string): Error {
  // El mismo error que lanza una wallet de extensión: los adaptadores ya lo
  // reconocen por nombre y lo cuentan como "cancelaste la firma".
  return new UserRejectedRequestError(new Error(detalle))
}

class PuertaDeFirma {
  private cola: EnCola[] = []
  private readonly oyentes = new Set<() => void>()
  private siguienteId = 1

  subscribe = (oyente: () => void): (() => void) => {
    this.oyentes.add(oyente)
    return () => this.oyentes.delete(oyente)
  }

  /** La petición que la UI debe enseñar ahora, o `null`. */
  actual = (): PeticionDeFirma | null => this.cola[0]?.peticion ?? null

  /** Cuántas esperan en total, para que el diálogo pueda decir "1 de 3". */
  pendientes = (): number => this.cola.length

  /**
   * Encola una firma y espera la decisión humana. Resuelve si se aprueba;
   * lanza `UserRejectedRequestError` si se rechaza, si se bloquea la bóveda o
   * si nadie responde en `FIRMA_TIMEOUT_MS`.
   */
  solicitar(descripcion: Omit<PeticionDeFirma, 'id'>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const id = this.siguienteId++
      const temporizador = setTimeout(() => {
        this.sacar(id)?.rechazar(
          rechazoDelUsuario('La confirmación de la firma caducó sin respuesta'),
        )
        this.avisar()
      }, FIRMA_TIMEOUT_MS)
      this.cola.push({
        peticion: { ...descripcion, id },
        resolver: resolve,
        rechazar: reject,
        temporizador,
      })
      this.avisar()
    })
  }

  aprobar(id: number): void {
    const entrada = this.sacar(id)
    entrada?.resolver()
    this.avisar()
  }

  rechazar(id: number): void {
    const entrada = this.sacar(id)
    entrada?.rechazar(rechazoDelUsuario('Has rechazado la firma'))
    this.avisar()
  }

  /** Tira toda la cola: la bóveda se bloqueó o el usuario desconectó. */
  rechazarTodas(motivo: string): void {
    const pendientes = this.cola
    this.cola = []
    for (const entrada of pendientes) {
      clearTimeout(entrada.temporizador)
      entrada.rechazar(rechazoDelUsuario(motivo))
    }
    if (pendientes.length > 0) this.avisar()
  }

  private sacar(id: number): EnCola | null {
    const indice = this.cola.findIndex((e) => e.peticion.id === id)
    if (indice === -1) return null
    const [entrada] = this.cola.splice(indice, 1)
    if (entrada === undefined) return null
    clearTimeout(entrada.temporizador)
    return entrada
  }

  private avisar(): void {
    for (const oyente of this.oyentes) oyente()
  }
}

/** Cola única que comparten la bóveda y el diálogo de la UI. */
export const puertaDeFirma = new PuertaDeFirma()

// --- El envoltorio de la cuenta -----------------------------------------------

/**
 * Devuelve la misma cuenta pero con TODAS sus operaciones de firma detrás de
 * la puerta. Lo usa la bóveda: la cuenta cruda nunca sale de ella.
 *
 * `puerta` es inyectable solo para los tests; en la app es la única cola.
 */
export function conPuertaDeFirma(
  cuenta: PrivateKeyAccount,
  puerta: Pick<PuertaDeFirma, 'solicitar'> = puertaDeFirma,
): PrivateKeyAccount {
  const pedir = async (descripcion: Omit<PeticionDeFirma, 'id'>): Promise<void> => {
    await puerta.solicitar(descripcion)
  }

  return {
    ...cuenta,

    async sign(parametros) {
      await pedir({
        titulo: 'Firmar un dato en crudo',
        resumen:
          'Se te pide firmar un hash suelto. La app NO puede saber qué autoriza: podría ser cualquier cosa, incluida una orden de mover tus fondos. Si no sabes de dónde sale, recházala.',
        detalles: [{ etiqueta: 'Hash', valor: parametros.hash, destacado: true }],
        crudo: parametros.hash,
        riesgo: 'alto',
      })
      return cuenta.sign(parametros)
    },

    async signAuthorization(parametros) {
      // viem admite `address` o su alias `contractAddress`.
      const delegado = parametros.address ?? parametros.contractAddress
      await pedir({
        titulo: 'Delegar el control de tu wallet',
        resumen:
          'Esto entrega el control de tu dirección a un contrato (EIP-7702). La app nunca lo pide: si ves esto, recházalo.',
        detalles: [
          {
            etiqueta: 'Contrato',
            valor: delegado === undefined ? 'sin especificar' : etiquetaDe(delegado),
            destacado: true,
          },
          { etiqueta: 'Red', valor: chainLabel(parametros.chainId) },
        ],
        crudo: aJson(parametros),
        riesgo: 'alto',
      })
      return cuenta.signAuthorization(parametros)
    },

    async signMessage(parametros) {
      const { message } = parametros
      const texto =
        typeof message === 'string' ? message : `(datos en crudo) ${aJson(message)}`
      await pedir({
        titulo: 'Firmar un mensaje',
        resumen:
          'Firmas un texto para demostrar que la wallet es tuya. Esto NO mueve fondos por sí solo.',
        detalles: [{ etiqueta: 'Mensaje', valor: texto, destacado: true }],
        crudo: texto,
        riesgo: 'normal',
      })
      return cuenta.signMessage(parametros)
    },

    async signTransaction(...argumentos) {
      const [transaccion] = argumentos
      await pedir(describirTransaccion(transaccion as TransaccionFirmable))
      return cuenta.signTransaction(...argumentos)
    },

    async signTypedData(parametros) {
      await pedir(describirTypedData(parametros as unknown as TypedDataFirmable))
      return cuenta.signTypedData(parametros)
    },
  }
}
