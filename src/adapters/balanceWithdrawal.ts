import { erc20Abi, getAddress, isAddress, parseUnits, type Hex, type PublicClient, type WalletClient } from 'viem'
import type { WithdrawalPort, WithdrawalRequest } from '../domain/withdrawal'
import { PayoutTransferReverted, transferPayoutToken } from './payoutTransactions'

interface Token { venue: string; chainId: number; address: Hex; decimals: number }
interface Dependencies {
  tokens: Token[]
  clients: (chainId: number) => Promise<{ publicClient: PublicClient; walletClient: WalletClient }>
  storage: () => Storage
}
interface Pending extends WithdrawalRequest { hash: Hex | null }
const KEY = 'balance-withdrawals-v1'
const hashPattern = /^0x[0-9a-f]{64}$/i

/** No depende de tickets. Guarda el intento antes de firmar y el hash antes de esperar. */
export function createBalanceWithdrawal({ tokens, clients, storage }: Dependencies): WithdrawalPort {
  const locks = new Set<string>()
  function records(): Pending[] {
    const value: unknown = JSON.parse(storage().getItem(KEY) ?? '[]')
    if (!Array.isArray(value)) throw new Error('El registro de retiros no es válido.')
    return value.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new Error('El registro de retiros no es válido.')
      const p = item as Record<string, unknown>
      if (typeof p.venue !== 'string' || typeof p.from !== 'string' || !isAddress(p.from)
        || typeof p.recipient !== 'string' || !isAddress(p.recipient) || typeof p.amount !== 'string'
        || !(p.hash === null || typeof p.hash === 'string' && hashPattern.test(p.hash))) {
        throw new Error('El registro de retiros no es válido.')
      }
      return { venue: p.venue, from: p.from, recipient: p.recipient, amount: p.amount, hash: p.hash as Hex | null }
    })
  }
  const matches = (p: Pending, venue: string, from: string) => p.venue === venue && p.from.toLowerCase() === from.toLowerCase()
  const save = (request: WithdrawalRequest, next: Pending | null) => {
    const rest = records().filter(p => !matches(p, request.venue, request.from))
    storage().setItem(KEY, JSON.stringify(next ? [...rest, next] : rest))
  }
  return {
    pending(venue, from) {
      try { return records().find(p => matches(p, venue, from)) ?? null } catch { return null }
    },
    async withdraw(request, onProgress) {
      const key = `${request.venue}:${request.from.toLowerCase()}`
      let submitted = false
      let started = false
      let ownsLock = false
      let signing = false
      try {
        if (locks.has(key)) throw new Error('Ya hay un retiro en curso.')
        locks.add(key)
        ownsLock = true
        const token = tokens.find(t => t.venue === request.venue)
        if (!token || !isAddress(request.from) || !isAddress(request.recipient) || /^0x0{40}$/i.test(request.recipient)
          || request.from.toLowerCase() === request.recipient.toLowerCase()) throw new Error('Selecciona un token y una dirección externa válida.')
        if (!new RegExp(`^\\d+(?:\\.\\d{1,${token.decimals}})?$`).test(request.amount)) throw new Error('El importe tiene un formato o decimales incorrectos.')
        const amount = parseUnits(request.amount, token.decimals)
        if (amount <= 0n) throw new Error('El importe debe ser mayor que cero.')
        const old = records().find(p => matches(p, request.venue, request.from))
        if (old && (old.recipient.toLowerCase() !== request.recipient.toLowerCase() || old.amount !== request.amount)) throw new Error('Comprueba primero el retiro pendiente.')
        if (old && !old.hash) throw new Error('Hay una firma anterior sin hash registrado. Comprueba su estado en tu wallet antes de volver a retirar.')
        submitted = Boolean(old?.hash)
        onProgress({ status: 'pending' })
        const { publicClient, walletClient } = await clients(token.chainId)
        if (!old) {
          const balance = await publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(request.from)] })
          if (typeof balance !== 'bigint') throw new Error('No se pudo validar el saldo disponible.')
          if (amount > balance) throw new Error('Saldo disponible insuficiente.')
          save(request, { ...request, hash: null })
          started = true
        }
        const hash = await transferPayoutToken(publicClient, walletClient, token.address, getAddress(request.recipient), amount,
          getAddress(request.from), hash => {
            submitted = true
            save(request, { ...request, hash })
            onProgress({ status: 'confirming', hash })
          }, old?.hash ?? undefined, () => { signing = true })
        save(request, null)
        const explorer = token.chainId === 137 ? 'https://polygonscan.com' : token.chainId === 8453 ? 'https://basescan.org' : null
        return { ok: true, data: { hash, explorerUrl: explorer ? `${explorer}/tx/${hash}` : null } }
      } catch (cause) {
        const rejected = isRejected(cause)
        if (started && !submitted && (!signing || rejected) || cause instanceof PayoutTransferReverted) {
          try { save(request, null) } catch { /* Conserva el registro si el almacenamiento no está disponible. */ }
        }
        return { ok: false, error: { venue: request.venue, kind: rejected ? 'rejected' : 'wallet', message: cause instanceof Error ? cause.message : 'No se pudo completar el retiro. Comprueba tu wallet.', cause } }
      } finally { if (ownsLock) locks.delete(key) }
    },
  }
}

function isRejected(cause: unknown, depth = 0): boolean {
  if (!cause || typeof cause !== 'object' || depth > 8) return false
  const error = cause as { code?: unknown; cause?: unknown }
  return error.code === 4001 || isRejected(error.cause, depth + 1)
}
