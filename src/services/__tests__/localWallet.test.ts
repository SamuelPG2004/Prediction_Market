import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import {
  decryptPrivateKey,
  encryptPrivateKey,
  LocalWalletVault,
  type KeyValueStore,
} from '../localWallet'

function memoryStore(): KeyValueStore {
  const memory = new Map<string, string>()
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  }
}

const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
const PK_ADDRESS = privateKeyToAccount(PK).address
const PASSWORD = 'contraseña-larga'
// Con las 600k iteraciones de producción, PBKDF2 tarda ~2,5 s por derivación
// bajo Node; los tests bajan a un valor simbólico para no eternizar la suite.
const FAST_ITERATIONS = 1_000

function fastVault(store: KeyValueStore = memoryStore()): LocalWalletVault {
  return new LocalWalletVault(store, { iterations: FAST_ITERATIONS })
}

// Timeout holgado: WebCrypto compite mal por CPU cuando otra sesión de la
// máquina compila o testea a la vez, y a 5s la suite completa llegó a caducar.
describe('cifrado de la clave privada', { timeout: 20_000 }, () => {
  it('el ciclo cifrar → descifrar devuelve la misma clave', async () => {
    const vault = await encryptPrivateKey(PK, PASSWORD, FAST_ITERATIONS)
    expect(vault.address).toBe(PK_ADDRESS)
    // Nada del material sensible viaja en claro.
    expect(JSON.stringify(vault)).not.toContain(PK.slice(2))
    await expect(decryptPrivateKey(vault, PASSWORD)).resolves.toBe(PK)
  })

  it('una contraseña incorrecta falla con un error claro', async () => {
    const vault = await encryptPrivateKey(PK, PASSWORD, FAST_ITERATIONS)
    await expect(decryptPrivateKey(vault, 'otra-contraseña')).rejects.toThrow(
      'Contraseña incorrecta',
    )
  })
})

describe('LocalWalletVault', { timeout: 20_000 }, () => {
  it('crear genera, guarda cifrada y deja la cuenta desbloqueada', async () => {
    const vault = fastVault()
    expect(vault.hasStoredWallet()).toBe(false)

    const { address, privateKey } = await vault.create(PASSWORD)
    expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/)
    expect(vault.hasStoredWallet()).toBe(true)
    expect(vault.storedAddress()).toBe(address)
    expect(vault.isUnlocked()).toBe(true)
    expect(vault.requireAccount().address).toBe(address)
  })

  it('bloquear exige contraseña para volver a firmar', async () => {
    const vault = fastVault()
    const { address } = await vault.create(PASSWORD)

    vault.lock()
    expect(vault.isUnlocked()).toBe(false)
    expect(() => vault.requireAccount()).toThrow('bloqueada')

    await expect(vault.unlock('mala-contraseña')).rejects.toThrow('Contraseña incorrecta')
    await expect(vault.unlock(PASSWORD)).resolves.toBe(address)
    expect(vault.isUnlocked()).toBe(true)
  })

  it('importar valida el formato de la clave y conserva la dirección', async () => {
    const vault = fastVault()
    await expect(vault.importKey('0x1234', PASSWORD)).rejects.toThrow('inválida')

    await expect(vault.importKey(`  ${PK}  `, PASSWORD)).resolves.toBe(PK_ADDRESS)
    await expect(vault.revealPrivateKey(PASSWORD)).resolves.toBe(PK)
  })

  it('no deja sobrescribir una wallet existente sin borrarla antes', async () => {
    const vault = fastVault()
    await vault.create(PASSWORD)
    await expect(vault.importKey(PK, PASSWORD)).rejects.toThrow('Ya existe')

    vault.remove()
    expect(vault.hasStoredWallet()).toBe(false)
    expect(vault.isUnlocked()).toBe(false)
    await expect(vault.importKey(PK, PASSWORD)).resolves.toBe(PK_ADDRESS)
  })

  it('rechaza contraseñas más cortas que el mínimo', async () => {
    const vault = fastVault()
    await expect(vault.create('corta')).rejects.toThrow('al menos 8')
  })

  it('una bóveda corrupta en el almacenamiento cuenta como inexistente', () => {
    const store = memoryStore()
    store.setItem('aether.local-wallet.v1', '{esto no es json')
    const vault = new LocalWalletVault(store)
    expect(vault.hasStoredWallet()).toBe(false)
    expect(vault.storedAddress()).toBe(null)
  })
})
