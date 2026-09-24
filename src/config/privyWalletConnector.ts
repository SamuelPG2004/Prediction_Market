/**
 * Adaptador EIP-1193 para la EOA embebida de Privy.
 *
 * No usamos @privy-io/wagmi: su versión actual exige viem 2.56, mientras que
 * este proyecto debe permanecer en 2.55.19. El contrato EIP-1193 permite que
 * wagmi y, por tanto, los puentes de los venues, no distingan esta wallet de
 * una extensión.
 */
import { ChainNotConfiguredError, createConnector } from 'wagmi'
import { SwitchChainError, type Address } from 'viem'

export const PRIVY_WALLET_CONNECTOR_ID = 'privyEmbeddedWallet'

export interface PrivyProviderLike {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown
}

let active: { address: Address; provider: PrivyProviderLike; chainId: number; embedded: boolean } | null = null
type ConnectorEvent =
  | { event: 'connect'; data: { accounts: readonly Address[]; chainId: number } }
  | { event: 'change'; data: { accounts?: readonly Address[]; chainId?: number } }
  | { event: 'disconnect'; data: undefined }
let notify: ((event: ConnectorEvent) => void) | null = null

export function setPrivyWallet(wallet: typeof active): void {
  const before = active
  active = wallet
  if (wallet === null) {
    if (before !== null) notify?.({ event: 'disconnect', data: undefined })
    return
  }
  notify?.(before === null
    ? { event: 'connect', data: { accounts: [wallet.address], chainId: wallet.chainId } }
    : { event: 'change', data: { accounts: [wallet.address], chainId: wallet.chainId } })
}

export function isPrivyEmbeddedWalletActive(): boolean {
  return active?.embedded ?? false
}

export function privyWalletConnector() {
  return createConnector<PrivyProviderLike>((config) => ({
    id: PRIVY_WALLET_CONNECTOR_ID,
    name: 'Wallet embebida',
    type: 'privyEmbeddedWallet',
    async setup() {
      notify = ({ event, data }) => {
        if (event === 'disconnect') config.emitter.emit('disconnect')
        else config.emitter.emit(event, data)
      }
    },
    async connect(parameters = {}) {
      if (active === null) throw new Error('Inicia sesión para crear tu wallet embebida.')
      if (parameters.chainId !== undefined && parameters.chainId !== active.chainId) {
        await this.switchChain!({ chainId: parameters.chainId })
      }
      return { accounts: [active.address] as never, chainId: active.chainId }
    },
    async disconnect() {
      // Cerrar la conexión de wagmi no debe borrar ni cerrar la sesión Privy.
      notify?.({ event: 'disconnect', data: undefined })
    },
    async getAccounts() { return active === null ? [] : [active.address] },
    async getChainId() { return active?.chainId ?? config.chains[0].id },
    async getProvider() {
      if (active === null) throw new Error('No hay wallet embebida activa.')
      return active.provider
    },
    async isAuthorized() { return active !== null },
    async switchChain({ chainId }) {
      if (active === null) throw new Error('No hay wallet embebida activa.')
      const chain = config.chains.find((item) => item.id === chainId)
      if (chain === undefined) throw new SwitchChainError(new ChainNotConfiguredError())
      await active.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] })
      active = { ...active, chainId }
      notify?.({ event: 'change', data: { chainId } })
      return chain
    },
    onAccountsChanged() {}, onChainChanged() {}, onDisconnect() {},
  }))
}
