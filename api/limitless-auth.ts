/**
 * Firmante de Vercel para los endpoints AUTENTICADOS de Limitless.
 *
 * El tráfico público de /api/limitless/* va por el rewrite externo de
 * vercel.json directo a api.limitless.exchange (la allowlist de CORS no
 * afecta: el proxy es server-side). Solo las tres rutas autenticadas
 * (/orders, /profiles/me, /portfolio/positions — rutas fijas, ver
 * vercel.json) llegan aquí, con la ruta real en el query param `path`.
 *
 * Con `VITE_LIMITLESS_AUTH_MODE=proxy` el frontend no lleva credenciales:
 * marca la petición con `x-limitless-sign` y esta función firma HMAC-SHA256
 * con `LIMITLESS_API_TOKEN_ID` y `LIMITLESS_API_TOKEN_SECRET` (variables de
 * servidor, SIN prefijo VITE_: nunca entran en el bundle del navegador). Si
 * el navegador ya firmó (modo local con credenciales VITE_), se reenvía tal
 * cual.
 *
 * Mensaje canónico y cabeceras: espejo de src/adapters/limitless/auth.ts
 * (autocontenido a propósito: la carpeta api/ se despliega sola en Vercel y
 * no debe arrastrar imports de src/). Firma clásica (req, res) del runtime
 * Node de Vercel; WebCrypto, fetch y atob son globales en Node 20+.
 *
 * La firma HMAC cubre el body EXACTO que se reenvía: los helpers de Vercel
 * ya parsearon el JSON entrante, así que se re-serializa y ese string es a
 * la vez lo firmado y lo enviado — la coherencia queda garantizada.
 *
 * OJO: cualquier visitante del deploy puede hacer que esta función firme por
 * él (leer tus posiciones, enviar órdenes bajo tu perfil — siempre con SU
 * wallet y SUS fondos, nunca los tuyos). Para un deploy personal, activa
 * Deployment Protection en Vercel o no definas las credenciales.
 */

declare const process: { env: Record<string, string | undefined> }
declare const Buffer: {
  isBuffer(value: unknown): value is { toString(encoding: string): string }
}

const LIMITLESS_API_URL = 'https://api.limitless.exchange'
const SIGN_HEADER = 'x-limitless-sign'
const AUTH_HEADERS = ['lmts-api-key', 'lmts-timestamp', 'lmts-signature'] as const

/** Rutas que este firmante acepta: las autenticadas de vercel.json y nada más. */
const ALLOWED_PATHS = new Set(['/orders', '/profiles/me', '/portfolio/positions'])

/** Lo que usamos de la firma clásica (req, res) del runtime Node de Vercel. */
interface VercelRequest {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  /** Puesto por los helpers de Vercel: objeto si era JSON, string si texto. */
  body?: unknown
}
interface VercelResponse {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): void
  send(body: string): void
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Espejo de buildHmacHeaders en src/adapters/limitless/auth.ts. */
async function buildHmacHeaders(
  tokenId: string,
  secretBase64: string,
  method: string,
  pathWithQuery: string,
  body: string,
): Promise<Record<string, string>> {
  const timestamp = new Date().toISOString()
  const message = `${timestamp}\n${method.toUpperCase()}\n${pathWithQuery}\n${body}`
  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(secretBase64),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  )
  return {
    'lmts-api-key': tokenId,
    'lmts-timestamp': timestamp,
    'lmts-signature': bytesToBase64(new Uint8Array(signature)),
  }
}

function headerOf(req: VercelRequest, name: string): string | null {
  const value = req.headers[name]
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

function sendJsonError(res: VercelResponse, status: number, message: string): void {
  res.setHeader('content-type', 'application/json')
  res.status(status).send(JSON.stringify({ message }))
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  try {
    // req.url es relativa ('/api/limitless-auth?path=/orders'); la base da igual.
    const url = new URL(req.url ?? '/', 'http://vercel.internal')

    // Ruta real: el `path` que puso el rewrite de vercel.json. El resto de
    // params del query original (Vercel los fusiona) se reenvían con la ruta
    // — y forman parte del mensaje firmado, como en el cliente.
    const path = url.searchParams.get('path')
    if (path === null || !ALLOWED_PATHS.has(path)) {
      sendJsonError(res, 404, 'Ruta fuera del firmante de Limitless')
      return
    }
    const passthrough = new URLSearchParams(url.searchParams)
    passthrough.delete('path')
    const query = passthrough.toString()
    const pathWithQuery = query === '' ? path : `${path}?${query}`

    const method = (req.method ?? 'GET').toUpperCase()
    const body =
      method === 'GET' || method === 'HEAD' || req.body === undefined
        ? ''
        : typeof req.body === 'string'
          ? req.body
          : Buffer.isBuffer(req.body)
            ? req.body.toString('utf8')
            : JSON.stringify(req.body)

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== '') headers['Content-Type'] = 'application/json'

    // Si el navegador ya firmó (modo con credenciales VITE_), se respeta tal cual.
    for (const name of AUTH_HEADERS) {
      const value = headerOf(req, name)
      if (value !== null) headers[name] = value
    }

    const wantsSigning =
      headerOf(req, SIGN_HEADER) !== null && headerOf(req, 'lmts-api-key') === null
    if (wantsSigning) {
      const tokenId = process.env.LIMITLESS_API_TOKEN_ID
      const secret = process.env.LIMITLESS_API_TOKEN_SECRET
      if (tokenId === undefined || secret === undefined) {
        sendJsonError(
          res,
          501,
          'El proxy no tiene credenciales: define LIMITLESS_API_TOKEN_ID y LIMITLESS_API_TOKEN_SECRET (sin VITE_) en Vercel, o quita VITE_LIMITLESS_AUTH_MODE=proxy',
        )
        return
      }
      Object.assign(
        headers,
        await buildHmacHeaders(tokenId, secret, method, pathWithQuery, body),
      )
    }

    const upstream = await fetch(`${LIMITLESS_API_URL}${pathWithQuery}`, {
      method,
      headers,
      ...(body !== '' ? { body } : {}),
    })

    // Solo content-type: el resto (content-encoding, transfer-encoding…) no
    // debe reenviarse porque el cuerpo ya llega decodificado.
    const contentType = upstream.headers.get('content-type')
    if (contentType !== null) res.setHeader('content-type', contentType)
    res.status(upstream.status).send(await upstream.text())
  } catch (error) {
    sendJsonError(res, 502, `Fallo reenviando a Limitless: ${String(error)}`)
  }
}
