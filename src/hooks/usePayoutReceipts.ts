import { create } from 'zustand'
import type { Position, RedeemReceipt } from '../domain/types'

export interface PayoutRecord { position: Position; receipt: RedeemReceipt }
const storageKey = 'aether-payout-receipts-v1'
const decimal = (value: unknown) => typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)
const textOrNull = (value: unknown) => value === null || typeof value === 'string'
function restoredRecord(value: unknown): PayoutRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const { position: p, receipt: r } = value as Record<string, unknown>
  if (typeof p !== 'object' || p === null || typeof r !== 'object' || r === null) return null
  const position = p as Record<string, unknown>, receipt = r as Record<string, unknown>
  if (!['id', 'marketId', 'outcomeId', 'outcomeLabel', 'marketQuestion'].every(k => typeof position[k] === 'string') ||
      !decimal(position.stake) || !decimal(position.potentialPayout) ||
      !(position.currentValue === null || decimal(position.currentValue)) ||
      !['open', 'won', 'lost', 'redeemable', 'redeemed'].includes(String(position.status)) ||
      !['positionId', 'reference', 'tokenSymbol', 'recipient'].every(k => typeof receipt[k] === 'string') ||
      receipt.positionId !== position.id || !decimal(receipt.amount) ||
      !['explorerUrl', 'transferReference', 'transferExplorerUrl', 'transferError'].every(k => textOrNull(receipt[k]))) return null
  if (!['explorerUrl', 'transferExplorerUrl'].every(k => receipt[k] === null ||
      (typeof receipt[k] === 'string' && /^https:\/\//.test(receipt[k])))) return null
  const redeemedAt = new Date(String(receipt.redeemedAt))
  const openedAt = position.openedAt === null ? null : new Date(String(position.openedAt))
  if (!Number.isFinite(redeemedAt.getTime()) || (openedAt && !Number.isFinite(openedAt.getTime()))) return null
  return { position: { ...position, openedAt } as unknown as Position,
    receipt: { ...receipt, redeemedAt } as unknown as RedeemReceipt }
}
function restore(): Record<string, PayoutRecord> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).flatMap(([key, value]) => {
      const record = restoredRecord(value)
      return record ? [[key, record]] : []
    }))
  } catch { return {} }
}
export const payoutKey = (sender: string, positionId: string) => `${sender.toLowerCase()}:${positionId}`
export const usePayoutReceipts = create<{
  records: Record<string, PayoutRecord>
  save: (sender: string, position: Position, receipt: RedeemReceipt) => void
}>((set) => ({
  records: restore(),
  save: (sender, position, receipt) => set(state => {
    const records = { ...state.records, [payoutKey(sender, position.id)]: { position, receipt: { ...receipt } } }
    try { localStorage.setItem(storageKey, JSON.stringify(records)) } catch { /* Sigue disponible durante esta sesión. */ }
    return { records }
  }),
}))
