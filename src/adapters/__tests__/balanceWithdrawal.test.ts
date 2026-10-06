import { describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type PublicClient, type WalletClient } from 'viem'
import { createBalanceWithdrawal } from '../balanceWithdrawal'
const from = '0x1111111111111111111111111111111111111111' as const
const recipient = '0x2222222222222222222222222222222222222222' as const
const token = '0x3333333333333333333333333333333333333333' as const
const hash = `0x${'ab'.repeat(32)}` as const
const request = { venue: 'azuro', from, recipient, amount: '5.000001' }
function setup() {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } } as Storage
  const readContract = vi.fn().mockResolvedValue(20_000_000n)
  const simulateContract = vi.fn().mockResolvedValue({ result: true })
  const writeContract = vi.fn().mockResolvedValue(hash)
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success', transactionHash: hash, logs: [{ address: token,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to: recipient } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [5_000_001n]),
  }] })
  const clients = vi.fn().mockResolvedValue({ publicClient: { readContract, simulateContract, waitForTransactionReceipt } as unknown as PublicClient,
    walletClient: { account: { address: from }, writeContract } as unknown as WalletClient })
  const create = () => createBalanceWithdrawal({ tokens: [{ venue: 'azuro', chainId: 137, address: token, decimals: 6 }], clients, storage: () => storage })
  return { create, service: create(), data, storage, clients, writeContract, readContract, waitForTransactionReceipt, simulateContract }
}
describe('retiro de saldo ERC-20', () => {
  it('retira el importe exacto en 6 decimales sin tickets', async () => {
    const s = setup(), progress = vi.fn()
    const result = await s.service.withdraw(request, progress)
    expect(result.ok).toBe(true)
    expect(s.clients).toHaveBeenCalledWith(137)
    expect(s.writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'transfer', args: [recipient, 5_000_001n] }))
    expect(progress).toHaveBeenCalledWith({ status: 'confirming', hash })
    expect(s.service.pending('azuro', from)).toBeNull()
  })
  it('rechaza importes o destinos inválidos antes de firmar', async () => {
    const s = setup()
    for (const amount of ['0', '-1', '1.0000001', '1e2', 'NaN']) expect((await s.service.withdraw({ ...request, amount }, vi.fn())).ok).toBe(false)
    for (const address of ['mal', from, '0x0000000000000000000000000000000000000000']) expect((await s.service.withdraw({ ...request, recipient: address }, vi.fn())).ok).toBe(false)
    expect(s.writeContract).not.toHaveBeenCalled()
  })
  it('verifica el saldo real antes de enviar', async () => {
    const s = setup(); s.readContract.mockResolvedValue(4_000_000n)
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(false)
    expect(s.writeContract).not.toHaveBeenCalled()
  })
  it('recupera el hash tras recargar sin duplicar la transferencia ni exigir el saldo anterior', async () => {
    const s = setup(); s.waitForTransactionReceipt.mockRejectedValueOnce(new Error('timeout'))
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(false)
    const restored = s.create()
    expect(restored.pending('azuro', from)).toMatchObject(request)
    s.readContract.mockResolvedValue(0n)
    expect((await restored.withdraw(request, vi.fn())).ok).toBe(true)
    expect(s.writeContract).toHaveBeenCalledTimes(1)
    expect(s.readContract).toHaveBeenCalledTimes(1)
  })
  it('bloquea un destino diferente mientras hay una transacción pendiente', async () => {
    const s = setup(); s.waitForTransactionReceipt.mockRejectedValue(new Error('timeout'))
    await s.service.withdraw(request, vi.fn())
    expect((await s.service.withdraw({ ...request, amount: '1' }, vi.fn())).ok).toBe(false)
    expect(s.writeContract).toHaveBeenCalledTimes(1)
  })
  it('no firma si el almacenamiento está bloqueado o corrupto', async () => {
    const s = setup(); s.storage.setItem('balance-withdrawals-v1', '{}')
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(false)
    expect(s.writeContract).not.toHaveBeenCalled()
  })
  it('permite un nuevo intento solo después de comprobar un revertido', async () => {
    const s = setup(); s.waitForTransactionReceipt.mockResolvedValueOnce({ status: 'reverted', logs: [], transactionHash: hash })
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(false)
    expect(s.service.pending('azuro', from)).toBeNull()
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(true)
    expect(s.writeContract).toHaveBeenCalledTimes(2)
  })
  it('conserva una firma de resultado incierto y no vuelve a enviarla', async () => {
    const s = setup(); s.writeContract.mockRejectedValue(new Error('RPC interrumpido'))
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(false)
    expect(s.service.pending('azuro', from)).not.toBeNull()
    expect((await s.create().withdraw(request, vi.fn())).ok).toBe(false)
    expect(s.writeContract).toHaveBeenCalledTimes(1)
  })
  it('una firma rechazada permite corregir y reintentar', async () => {
    const s = setup(); s.writeContract.mockRejectedValueOnce({ code: 4001 })
    const result = await s.service.withdraw(request, vi.fn())
    expect(!result.ok && result.error.kind).toBe('rejected')
    expect(s.service.pending('azuro', from)).toBeNull()
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(true)
  })
  it('una simulación fallida no deja un envío pendiente', async () => {
    const s = setup(); s.simulateContract.mockResolvedValue({ result: false })
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(false)
    expect(s.service.pending('azuro', from)).toBeNull()
    expect(s.writeContract).not.toHaveBeenCalled()
  })
  it('el fallo de persistencia evita firmar', async () => {
    const s = setup(); s.storage.setItem = () => { throw new Error('Almacenamiento bloqueado') }
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(false)
    expect(s.writeContract).not.toHaveBeenCalled()
  })
  it('bloquea clics repetidos mientras se confirma', async () => {
    const s = setup(); let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    s.waitForTransactionReceipt.mockImplementationOnce(async () => { await blocked; throw new Error('timeout') })
    let submitted!: () => void
    const ready = new Promise<void>(resolve => { submitted = resolve })
    const first = s.service.withdraw(request, p => { if (p.status === 'confirming') submitted() })
    await ready
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(false)
    expect((await s.service.withdraw(request, vi.fn())).ok).toBe(false)
    release(); await first
    expect(s.writeContract).toHaveBeenCalledTimes(1)
  })

})
