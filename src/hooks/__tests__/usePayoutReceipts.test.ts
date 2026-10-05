import { afterEach, describe, expect, it, vi } from 'vitest'
import { toDecimal, type Position, type RedeemReceipt } from '../../domain/types'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
const position: Position = { id: 'azuro:ticket', marketId: 'azuro:1/2', outcomeId: '1',
  marketQuestion: 'Partido', outcomeLabel: 'Local', stake: toDecimal('5'),
  potentialPayout: toDecimal('20'), currentValue: null, status: 'redeemable', openedAt: null }
const receipt: RedeemReceipt = { positionId: position.id, reference: `0x${'ab'.repeat(32)}`,
  explorerUrl: 'https://polygonscan.com/tx/claim', redeemedAt: new Date('2026-10-05T12:00:00Z'),
  amount: toDecimal('20'), tokenSymbol: 'USDT', recipient: '0x2222222222222222222222222222222222222222',
  transferReference: null, transferExplorerUrl: null, transferError: 'Pendiente', transferData: {} }
describe('recuperación de premios pendientes', () => {
  it('guarda por wallet y restaura el segundo paso tras recargar', async () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value) })
    const first = await import('../usePayoutReceipts')
    first.usePayoutReceipts.getState().save('0xAAA', position, receipt)
    vi.resetModules()
    const second = await import('../usePayoutReceipts')
    const record = second.usePayoutReceipts.getState().records[second.payoutKey('0xaaa', position.id)]
    expect(record.receipt.amount).toBe('20')
    expect(record.receipt.redeemedAt).toBeInstanceOf(Date)
    expect(record.receipt.transferError).toBe('Pendiente')
    expect(second.usePayoutReceipts.getState().records[second.payoutKey('0xBBB', position.id)]).toBeUndefined()
  })
  it('descarta datos corruptos y URLs inseguras sin bloquear la pantalla', async () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ bad: { position, receipt: { ...receipt, explorerUrl: 'javascript:alert(1)' } }, malformed: 123 }) })
    const { usePayoutReceipts } = await import('../usePayoutReceipts')
    expect(usePayoutReceipts.getState().records).toEqual({})
  })
})
