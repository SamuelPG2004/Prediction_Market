/**
 * Conector wagmi de la wallet local de la app.
 *
 * Presenta la bóveda (services/localWallet.ts) como un conector más, así que
 * saldos, apuestas, cash out y retiros pasan por el MISMO camino que MetaMask
 * o WalletConnect y ni la UI ni los adaptadores distinguen quién firma.
 *
 * En vez de simular un provider EIP-1193 entero, implementa `getClient`:
 * `getConnectorClient` de @wagmi/core lo usa con prioridad (verificado en
 * dist/esm/actions/getConnectorClient.js de la 3.7.x) y devuelve un
 * WalletClient de viem con la cuenta de clave privada, que firma en local.
 *
 * La bóveda solo vive desbloqueada en memoria, así que `isAuthorized` es
 * false tras recargar: wagmi no reconecta solo y la UI vuelve a pedir la
 * contraseña. Desconectar también bloquea.
 */
import { createWalletClient, http, SwitchChainError, type Address } from 'viem'
import { ChainNotConfiguredError, createConnector } from 'wagmi'
import { localWalletVault } from '../services/localWallet'
import { rpcUrlsFor } from './chains'

localWalletConnector.type = 'localWallet' as const

/** id estable, para que la UI pueda reconocer este conector entre todos. */
export const LOCAL_WALLET_CONNECTOR_ID = 'aetherLocalWallet'

export function localWalletConnector() {
  // La cadena activa es estado del conector (una wallet real la recuerda);
  // arranca en la primera configurada (Polygon) y cambia con switchChain.
  let currentChainId: number | undefined

  return createConnector<undefined>((config) => ({
    id: LOCAL_WALLET_CONNECTOR_ID,
    name: 'Wallet de la app',
    type: localWalletConnector.type,

    async setup() {
      currentChainId = config.chains[0].id
      // Auto-bloqueo por inactividad (o bloqueo manual): la conexión de
      // wagmi debe caer con la bóveda, o la UI seguiría como conectada
      // mientras cada firma fallaría con "bloqueada".
      localWalletVault.onLock(() => config.emitter.emit('disconnect'))
    },

    async connect(parameters = {}) {
      const account = localWalletVault.requireAccount()
      const chainId = parameters.chainId
      if (chainId !== undefined && chainId !== currentChainId) {
        const chain = await this.switchChain!({ chainId })
        currentChainId = chain.id
      }
      return {
        // `never` por el genérico withCapabilities del contrato; aquí las
        // cuentas son direcciones planas, sin capabilities.
        accounts: [account.address] as never,
        chainId: await this.getChainId(),
      }
    },

    async disconnect() {
      localWalletVault.lock()
    },

    async getAccounts(): Promise<readonly Address[]> {
      const account = localWalletVault.account()
      return account === null ? [] : [account.address]
    },

    async getChainId() {
      return currentChainId ?? config.chains[0].id
    },

    async getProvider() {
      // No hay provider EIP-1193: todo pasa por getClient.
      return undefined
    },

    async getClient(parameters = {}) {
      const account = localWalletVault.requireAccount()
      const chainId = parameters.chainId ?? (await this.getChainId())
      const chain = config.chains.find((c) => c.id === chainId)
      if (!chain) throw new SwitchChainError(new ChainNotConfiguredError())
      const transport =
        config.transports?.[chainId] ?? http(rpcUrlsFor(chainId)[0])
      return createWalletClient({ account, chain, transport })
    },

    async isAuthorized() {
      // Tras recargar, la clave ya no está en memoria: nada de reconexión
      // silenciosa, se vuelve a pedir la contraseña.
      return localWalletVault.isUnlocked()
    },

    async switchChain({ chainId }) {
      const chain = config.chains.find((c) => c.id === chainId)
      if (!chain) throw new SwitchChainError(new ChainNotConfiguredError())
      currentChainId = chainId
      config.emitter.emit('change', { chainId })
      return chain
    },

    onAccountsChanged() {
      // La cuenta solo cambia borrando la bóveda, que pasa por disconnect.
    },

    onChainChanged() {
      // La cadena la gobierna switchChain; no hay provider que avise.
    },

    onDisconnect() {
      localWalletVault.lock()
      config.emitter.emit('disconnect')
    },
  }))
}
