import { describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Address, type Hex, type PublicClient, type TransactionReceipt, type WalletClient } from 'viem'
import { payoutAccount, receivedPayout, transferPayoutToken, PayoutTransferReverted } from '../payoutTransactions'

const sender: Address = '0x1111111111111111111111111111111111111111'
const recipient: Address = '0x2222222222222222222222222222222222222222'
const token: Address = '0x3333333333333333333333333333333333333333'
const contract: Address = '0x4444444444444444444444444444444444444444'
const hash: Hex = `0x${'ab'.repeat(32)}`
function receipt(from: Address, to: Address, amount = 20_000_000n, status = 'success'): TransactionReceipt {
  return { status, transactionHash: hash, logs: [{ address: token,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
  }] } as unknown as TransactionReceipt
}
function clients(result = receipt(sender, recipient)) {
  const simulateContract = vi.fn().mockResolvedValue({ result: true })
  const writeContract = vi.fn().mockResolvedValue(hash)
  const waitForTransactionReceipt = vi.fn().mockResolvedValue(result)
  const publicClient = { simulateContract, waitForTransactionReceipt } as unknown as PublicClient
  const wallet = { account: { address: sender }, writeContract } as unknown as WalletClient
  return { publicClient, wallet, simulateContract, writeContract, waitForTransactionReceipt }
}
describe('cobro real y segunda transacción ERC-20', () => {
  it('lee exactamente 20 USDT en 6 decimales y descarta otros tokens o destinatarios', () => {
    const r = receipt(contract, sender)
    expect(receivedPayout(r, token, contract, sender)).toBe(20_000_000n)
    expect(receivedPayout(r, recipient, contract, sender)).toBe(0n)
    expect(receivedPayout(r, token, contract, recipient)).toBe(0n)
  })
  it('emite transfer con el importe exacto y espera el evento confirmado', async () => {
    const c = clients(), submitted = vi.fn()
    expect(await transferPayoutToken(c.publicClient, c.wallet, token, recipient, 20_000_000n, sender, submitted)).toBe(hash)
    expect(c.writeContract).toHaveBeenCalledWith(expect.objectContaining({ address: token, functionName: 'transfer', args: [recipient, 20_000_000n] }))
    expect(submitted).toHaveBeenCalledWith(hash)
  })
  it('recomprueba un hash enviado sin firmar ni duplicar el envío', async () => {
    const c = clients()
    await transferPayoutToken(c.publicClient, c.wallet, token, recipient, 20_000_000n, sender, undefined, hash)
    expect(c.simulateContract).not.toHaveBeenCalled()
    expect(c.writeContract).not.toHaveBeenCalled()
    expect(c.waitForTransactionReceipt).toHaveBeenCalledWith({ hash })
  })
  it('un timeout conserva el hash notificado y nunca envía otro al comprobarlo', async () => {
    const c = clients(), submitted = vi.fn()
    c.waitForTransactionReceipt.mockRejectedValue(new Error('timeout'))
    await expect(transferPayoutToken(c.publicClient, c.wallet, token, recipient, 20_000_000n, sender, submitted)).rejects.toThrow('timeout')
    await expect(transferPayoutToken(c.publicClient, c.wallet, token, recipient, 20_000_000n, sender, submitted, hash)).rejects.toThrow('timeout')
    expect(submitted).toHaveBeenCalledWith(hash)
    expect(c.writeContract).toHaveBeenCalledTimes(1)
  })
  it('rechaza cambio de wallet, retorno false, evento incorrecto y recibo revertido', async () => {
    const c = clients()
    expect(() => payoutAccount(c.wallet, recipient)).toThrow('wallet')
    c.simulateContract.mockResolvedValue({ result: false })
    await expect(transferPayoutToken(c.publicClient, c.wallet, token, recipient, 20_000_000n, sender)).rejects.toThrow('rechazó')
    expect(c.writeContract).not.toHaveBeenCalled()
    const incorrect = clients(receipt(sender, contract))
    await expect(transferPayoutToken(incorrect.publicClient, incorrect.wallet, token, recipient, 20_000_000n, sender, undefined, hash)).rejects.toThrow('importe esperado')
    const reverted = clients(receipt(sender, recipient, 20_000_000n, 'reverted'))
    await expect(transferPayoutToken(reverted.publicClient, reverted.wallet, token, recipient, 20_000_000n, sender, undefined, hash)).rejects.toBeInstanceOf(PayoutTransferReverted)
  })
})
