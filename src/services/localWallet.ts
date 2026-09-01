/**
 * Wallet local de la app (la "bóveda").
 *
 * Guarda UNA clave privada cifrada con contraseña en el navegador y la
 * desbloquea solo en memoria. Es la pieza que permite operar sin extensión de
 * wallet: depositas por cadena enviando fondos a su dirección, y el conector
 * de wagmi (config/localWalletConnector.ts) firma apuestas y retiros con la
 * cuenta desbloqueada de esta bóveda.
 *
 * Cifrado: AES-256-GCM con clave derivada por PBKDF2-SHA256 (600k
 * iteraciones), todo vía WebCrypto. La clave privada nunca toca el disco en
 * claro; al bloquear (o recargar la página) desaparece de memoria y hay que
 * volver a introducir la contraseña.
 */
import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from 'viem/accounts'

/** Subconjunto de localStorage, inyectable para poder testear en Node. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const STORAGE_KEY = 'aether.local-wallet.v1'
const PBKDF2_ITERATIONS = 600_000
export const MIN_PASSWORD_LENGTH = 8
/** Sin actividad este tiempo, la bóveda se bloquea sola. */
export const AUTO_LOCK_MS = 15 * 60_000

/** Lo que se persiste: solo material cifrado y los parámetros para descifrar. */
interface StoredVault {
  version: 1
  address: `0x${string}`
  kdf: 'pbkdf2-sha256'
  iterations: number
  cipher: 'aes-256-gcm'
  salt: string
  iv: string
  ciphertext: string
}

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Cifra una clave privada. `iterations` solo lo bajan los tests: PBKDF2 con
 * las 600k de producción tarda ~2,5 s por derivación bajo Node.
 */
export async function encryptPrivateKey(
  privateKey: `0x${string}`,
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<StoredVault> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const aesKey = await deriveAesKey(password, salt, iterations)
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aesKey,
    new TextEncoder().encode(privateKey),
  )
  return {
    version: 1,
    address: privateKeyToAccount(privateKey).address,
    kdf: 'pbkdf2-sha256',
    iterations,
    cipher: 'aes-256-gcm',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  }
}

/** Descifra la bóveda. Lanza `Error('Contraseña incorrecta')` si no cuadra. */
export async function decryptPrivateKey(
  vault: StoredVault,
  password: string,
): Promise<`0x${string}`> {
  const aesKey = await deriveAesKey(password, fromBase64(vault.salt), vault.iterations)
  let plaintext: ArrayBuffer
  try {
    plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(vault.iv) as BufferSource },
      aesKey,
      fromBase64(vault.ciphertext) as BufferSource,
    )
  } catch {
    // AES-GCM autentica el contenido: contraseña mala == descifrado fallido.
    throw new Error('Contraseña incorrecta')
  }
  const decoded = new TextDecoder().decode(plaintext)
  if (!PRIVATE_KEY_PATTERN.test(decoded)) {
    throw new Error('La bóveda guardada está corrupta')
  }
  return decoded as `0x${string}`
}

function parseStoredVault(raw: string | null): StoredVault | null {
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredVault>
    if (
      parsed.version === 1 &&
      typeof parsed.address === 'string' &&
      typeof parsed.iterations === 'number' &&
      typeof parsed.salt === 'string' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.ciphertext === 'string'
    ) {
      return parsed as StoredVault
    }
  } catch {
    // JSON roto: se trata igual que no tener bóveda.
  }
  return null
}

/** localStorage si existe (navegador); si no, un mapa efímero (tests/SSR). */
function defaultStore(): KeyValueStore {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage
  }
  const memory = new Map<string, string>()
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  }
}

export class LocalWalletVault {
  private readonly store: KeyValueStore
  private readonly iterations: number
  private readonly autoLockMs: number
  /** Cuenta desbloqueada, SOLO en memoria; `null` mientras está bloqueada. */
  private unlocked: PrivateKeyAccount | null = null
  private lockTimer: ReturnType<typeof setTimeout> | null = null
  private readonly lockListeners = new Set<() => void>()

  constructor(
    store: KeyValueStore = defaultStore(),
    options?: { iterations?: number; autoLockMs?: number },
  ) {
    this.store = store
    this.iterations = options?.iterations ?? PBKDF2_ITERATIONS
    this.autoLockMs = options?.autoLockMs ?? AUTO_LOCK_MS
  }

  /**
   * Avisa cuando la bóveda se bloquea (manual o por inactividad); el conector
   * de wagmi lo usa para marcar la conexión como desconectada. Devuelve la
   * función de baja.
   */
  onLock(listener: () => void): () => void {
    this.lockListeners.add(listener)
    return () => this.lockListeners.delete(listener)
  }

  /**
   * Actividad del usuario: reinicia la cuenta atrás del auto-bloqueo. La
   * llama la capa de UI con los eventos de teclado/puntero.
   */
  touch(): void {
    if (this.unlocked !== null) this.scheduleAutoLock()
  }

  private scheduleAutoLock(): void {
    if (this.lockTimer !== null) clearTimeout(this.lockTimer)
    this.lockTimer = setTimeout(() => this.lock(), this.autoLockMs)
  }

  hasStoredWallet(): boolean {
    return parseStoredVault(this.store.getItem(STORAGE_KEY)) !== null
  }

  /** Dirección guardada (visible sin contraseña), o `null` si no hay bóveda. */
  storedAddress(): `0x${string}` | null {
    return parseStoredVault(this.store.getItem(STORAGE_KEY))?.address ?? null
  }

  isUnlocked(): boolean {
    return this.unlocked !== null
  }

  account(): PrivateKeyAccount | null {
    return this.unlocked
  }

  requireAccount(): PrivateKeyAccount {
    if (this.unlocked === null) {
      throw new Error('La wallet de la app está bloqueada; desbloquéala primero')
    }
    return this.unlocked
  }

  /** Genera una wallet nueva, la cifra y la deja desbloqueada. */
  async create(password: string): Promise<{ address: `0x${string}`; privateKey: `0x${string}` }> {
    const privateKey = generatePrivateKey()
    const address = await this.storeKey(privateKey, password)
    return { address, privateKey }
  }

  /** Importa una clave existente, la cifra y la deja desbloqueada. */
  async importKey(privateKey: string, password: string): Promise<`0x${string}`> {
    const normalized = privateKey.trim()
    if (!PRIVATE_KEY_PATTERN.test(normalized)) {
      throw new Error('Clave privada inválida: debe ser 0x seguido de 64 caracteres hexadecimales')
    }
    return this.storeKey(normalized as `0x${string}`, password)
  }

  private async storeKey(
    privateKey: `0x${string}`,
    password: string,
  ): Promise<`0x${string}`> {
    if (this.hasStoredWallet()) {
      // Sobrescribir en silencio destruiría una clave con fondos; se exige
      // borrar la actual explícitamente antes.
      throw new Error('Ya existe una wallet guardada; bórrala antes de crear o importar otra')
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
    }
    const vault = await encryptPrivateKey(privateKey, password, this.iterations)
    this.store.setItem(STORAGE_KEY, JSON.stringify(vault))
    this.unlocked = privateKeyToAccount(privateKey)
    this.scheduleAutoLock()
    return this.unlocked.address
  }

  async unlock(password: string): Promise<`0x${string}`> {
    if (this.unlocked !== null) return this.unlocked.address
    const vault = parseStoredVault(this.store.getItem(STORAGE_KEY))
    if (vault === null) throw new Error('No hay ninguna wallet guardada')
    const privateKey = await decryptPrivateKey(vault, password)
    this.unlocked = privateKeyToAccount(privateKey)
    this.scheduleAutoLock()
    return this.unlocked.address
  }

  lock(): void {
    if (this.lockTimer !== null) {
      clearTimeout(this.lockTimer)
      this.lockTimer = null
    }
    if (this.unlocked === null) return
    this.unlocked = null
    for (const listener of this.lockListeners) listener()
  }

  /** Descifra y devuelve la clave para respaldarla; exige la contraseña. */
  async revealPrivateKey(password: string): Promise<`0x${string}`> {
    const vault = parseStoredVault(this.store.getItem(STORAGE_KEY))
    if (vault === null) throw new Error('No hay ninguna wallet guardada')
    return decryptPrivateKey(vault, password)
  }

  /** Borra la bóveda. Irreversible: sin respaldo de la clave, adiós fondos. */
  remove(): void {
    this.store.removeItem(STORAGE_KEY)
    this.lock()
  }
}

/** Instancia única que comparten el conector de wagmi y la UI. */
export const localWalletVault = new LocalWalletVault()
