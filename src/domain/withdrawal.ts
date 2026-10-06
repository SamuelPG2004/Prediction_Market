import type { Result } from './types'

export interface WithdrawalRequest {
  venue: string
  from: string
  recipient: string
  amount: string
}
export interface WithdrawalProgress {
  status: 'pending' | 'confirming'
  hash?: string
}
export interface WithdrawalReceipt {
  hash: string
  explorerUrl: string | null
}
export interface WithdrawalPort {
  withdraw(request: WithdrawalRequest, onProgress: (progress: WithdrawalProgress) => void): Promise<Result<WithdrawalReceipt>>
  pending(venue: string, from: string): WithdrawalRequest | null
}
