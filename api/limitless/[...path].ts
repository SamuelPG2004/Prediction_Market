/**
 * Proxy de Vercel hacia la API de Limitless: producción equivale al proxy de
 * dev de vite.config.ts, con una diferencia clave — aquí también se FIRMA.
 *
 * La API de Limitless solo permite CORS a sus dominios, así que el navegador
 * llama a /api/limitless/* (same-origin) y esta función reenvía. Además, con
 * `VITE_LIMITLESS_AUTH_MODE=proxy` el frontend no lleva credenciales: marca
 * las peticiones autenticadas con la cabecera `x-limitless-sign` y es esta
 * función quien firma HMAC-SHA256 con `LIMITLESS_API_TOKEN_ID` y
 * `LIMITLESS_API_TOKEN_SECRET` (variables de servidor, SIN prefijo VITE_:
 * nunca entran en el bundle del navegador).
 *
 * Mensaje canónico y cabeceras: espejo exacto de src/adapters/limitless/auth.ts
 * (autocontenido a propósito: la carpeta api/ se despliega sola en Vercel y no
 * debe arrastrar imports de src/). Runtime Edge: mismas primitivas WebCrypto y
 * fetch que el navegador.
 *
 * OJO: cualquier visitante del deploy puede hacer que esta función firme por
 * él (leer tus posiciones, enviar órdenes bajo tu perfil — siempre con SU
 * wallet y SUS fondos, nunca los tuyos). Para un deploy personal, activa
 * Deployment Protection en Vercel o no definas las credenciales.
 */

export const config = { runtime: 'edge' }

declare const process: { env: Record<string, string | undefined> }

const LIMITLESS_API_URL = 'https://api.limitless.exchange'
const PROXY_PREFIX = '/api/limitless'
const SIGN_HEADER = 'x-limitless-sign'
const AUTH_HEADERS = ['lmts-api-key', 'lmts-timestamp', 'lmts-signature'] as const

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

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith(PROXY_PREFIX)) {
    return jsonError(404, 'Ruta fuera del proxy de Limitless')
  }
  // La firma cubre la ruta REAL (la que ve el servidor de Limitless), no la
  // del proxy: mismo contrato que el cliente firmante (ver auth.ts).
  const pathWithQuery =
    (url.pathname.slice(PROXY_PREFIX.length) || '/') + url.search
  const method = request.method.toUpperCase()
  const body =
    method === 'GET' || method === 'HEAD' ? '' : await request.text()

  const headers = new Headers({ Accept: 'application/json' })
  if (body !== '') headers.set('Content-Type', 'application/json')

  // Si el navegador ya firmó (modo con credenciales VITE_), se respeta tal cual.
  for (const name of AUTH_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }

  const wantsSigning =
    request.headers.get(SIGN_HEADER) !== null &&
    request.headers.get('lmts-api-key') === null
  if (wantsSigning) {
    const tokenId = process.env.LIMITLESS_API_TOKEN_ID
    const secret = process.env.LIMITLESS_API_TOKEN_SECRET
    if (tokenId === undefined || secret === undefined) {
      return jsonError(
        501,
        'El proxy no tiene credenciales: define LIMITLESS_API_TOKEN_ID y LIMITLESS_API_TOKEN_SECRET (sin VITE_) en Vercel, o quita VITE_LIMITLESS_AUTH_MODE=proxy',
      )
    }
    const hmac = await buildHmacHeaders(tokenId, secret, method, pathWithQuery, body)
    for (const [name, value] of Object.entries(hmac)) headers.set(name, value)
  }

  const upstream = await fetch(`${LIMITLESS_API_URL}${pathWithQuery}`, {
    method,
    headers,
    ...(body !== '' ? { body } : {}),
  })

  // Solo content-type: el resto (content-encoding, transfer-encoding, CORS
  // del upstream…) no debe reenviarse porque el cuerpo ya llega decodificado.
  const responseHeaders = new Headers()
  const contentType = upstream.headers.get('content-type')
  if (contentType !== null) responseHeaders.set('content-type', contentType)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
