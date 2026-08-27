/**
 * Firma HMAC-SHA256 de peticiones a la API de Limitless.
 *
 * Mensaje canónico (doc oficial de autenticación):
 *
 *   {timestamp ISO-8601}\n{MÉTODO HTTP}\n{ruta con query}\n{cuerpo}
 *
 * El secreto llega en base64 y la firma se emite en base64. Se usa WebCrypto
 * (`crypto.subtle`) para funcionar igual en navegador y en Node 18+, sin
 * depender de `node:crypto`.
 */
import type { LimitlessAuth } from './config.ts'

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  // ArrayBuffer explícito: WebCrypto exige BufferSource sin SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export interface HmacHeaders {
  'lmts-api-key': string
  'lmts-timestamp': string
  'lmts-signature': string
}

/**
 * Construye las tres cabeceras de autenticación para una petición.
 *
 * @param pathWithQuery Ruta completa con query string (p. ej. `/orders?x=1`),
 *   nunca la URL entera.
 * @param body Cuerpo EXACTO que se enviará (string ya serializado); vacío en GET.
 * @param now Inyectable para tests; por defecto, el reloj real.
 */
export async function buildHmacHeaders(
  auth: LimitlessAuth,
  method: string,
  pathWithQuery: string,
  body: string,
  now: () => Date = () => new Date(),
): Promise<HmacHeaders> {
  const timestamp = now().toISOString()
  const message = `${timestamp}\n${method.toUpperCase()}\n${pathWithQuery}\n${body}`

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(auth.secret),
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
    'lmts-api-key': auth.tokenId,
    'lmts-timestamp': timestamp,
    'lmts-signature': bytesToBase64(new Uint8Array(signature)),
  }
}
