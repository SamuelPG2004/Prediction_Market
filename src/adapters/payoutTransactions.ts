import { erc20Abi, parseEventLogs, type Address, type Hex, type PublicClient, type TransactionReceipt, type WalletClient } from 'viem'

export class PayoutTransferReverted extends Error {
  constructor() { super('El envío revirtió en la red. El premio sigue en la wallet conectada; puedes reintentar el envío.') }
}

export function payoutAccount(wallet: WalletClient, expectedFrom: Address) {
  const account = wallet.account
  if (!account || account.address.toLowerCase() !== expectedFrom.toLowerCase()) {
    throw new Error('Conecta la wallet que inició el cobro antes de continuar.')
  }
  return account
}

/** Importe real, exclusivamente de los Transfer del token y contrato esperados. */
export function receivedPayout(receipt: TransactionReceipt, token: Address, from: Address, to: Address): bigint {
  if (receipt.status !== 'success') throw new Error('La transacción revirtió en la red.')
  return parseEventLogs({
    abi: erc20Abi,
    eventName: 'Transfer',
    logs: receipt.logs.filter(log => log.address.toLowerCase() === token.toLowerCase()),
    strict: true,
  }).reduce((sum, log) => log.args.from.toLowerCase() === from.toLowerCase() && log.args.to.toLowerCase() === to.toLowerCase() ? sum + log.args.value : sum, 0n)
}

export async function transferPayoutToken(publicClient: PublicClient, wallet: WalletClient,
  token: Address, recipient: Address, amount: bigint, expectedFrom: Address,
  onSubmitted?: (hash: Hex) => void, existingHash?: Hex): Promise<Hex> {
  const account = payoutAccount(wallet, expectedFrom)
  let hash = existingHash
  // Un hash existente se comprueba; nunca se emite otra transferencia al reintentar.
  if (!hash) {
    const simulation = await publicClient.simulateContract({ address: token, abi: erc20Abi,
      functionName: 'transfer', args: [recipient, amount], account, chain: wallet.chain })
    if (!simulation.result) throw new Error('El token rechazó la transferencia.')
    hash = await wallet.writeContract({ address: token, abi: erc20Abi,
      functionName: 'transfer', args: [recipient, amount], account, chain: wallet.chain })
  }
  onSubmitted?.(hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') throw new PayoutTransferReverted()
  if (receivedPayout(receipt, token, expectedFrom, recipient) !== amount) {
    throw new Error('No se ha confirmado el envío del importe esperado. Comprueba la transacción en el explorador antes de operar desde tu wallet.')
  }
  return receipt.transactionHash
}
