import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { PrivyProvider, useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount, useConnect } from 'wagmi'
import { PRIVY_WALLET_CONNECTOR_ID, setPrivyWallet, type PrivyProviderLike } from '../config/privyWalletConnector'

type WalletCreationStatus = 'idle' | 'creating' | 'error' | 'timeout'
const WALLET_CREATION_TIMEOUT_MS = 20_000

interface EmbeddedAuth {
  enabled: boolean
  ready: boolean
  authenticated: boolean
  login: () => void
  logout: () => Promise<void>
  walletCreationStatus: WalletCreationStatus
  walletCreationError: string | null
  retryWalletCreation: () => void
}
const unavailable: EmbeddedAuth = {
  enabled: false,
  ready: true,
  authenticated: false,
  login: () => {},
  logout: async () => {},
  walletCreationStatus: 'idle',
  walletCreationError: null,
  retryWalletCreation: () => {},
}
const AuthContext = createContext<EmbeddedAuth>(unavailable)
export const useEmbeddedAuth = () => useContext(AuthContext)

function PrivySession({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { createWallet } = useCreateWallet()
  const { connectAsync, connectors } = useConnect()
  const { address: connectedAddress, connector: connectedConnector } = useAccount()
  const wallet = wallets.find((item) => item.type === 'ethereum' && (item.walletClientType === 'privy' || item.walletClientType === 'privy-v2'))
    ?? wallets.find((item) => item.type === 'ethereum')
  const [walletCreationStatus, setWalletCreationStatus] = useState<WalletCreationStatus>('idle')
  const [walletCreationError, setWalletCreationError] = useState<string | null>(null)
  const [walletRetryNonce, setWalletRetryNonce] = useState(0)
  const createInFlight = useRef(false)
  const createAttempted = useRef(false)
  const creationTimeout = useRef<number | null>(null)
  const authenticatedRef = useRef(authenticated)
  authenticatedRef.current = authenticated

  const clearCreationTimeout = useCallback(() => {
    if (creationTimeout.current !== null) {
      window.clearTimeout(creationTimeout.current)
      creationTimeout.current = null
    }
  }, [])

  const startCreationTimeout = useCallback(() => {
    clearCreationTimeout()
    creationTimeout.current = window.setTimeout(() => {
      setWalletCreationError('Privy todavía no responde. La solicitud sigue pendiente; cierra sesión antes de volver a intentarlo para evitar crear wallets duplicadas.')
      setWalletCreationStatus('timeout')
    }, WALLET_CREATION_TIMEOUT_MS)
  }, [clearCreationTimeout])

  const createEmbeddedWallet = useCallback(() => {
    if (createInFlight.current || createAttempted.current) return

    createInFlight.current = true
    createAttempted.current = true
    setWalletCreationError(null)
    setWalletCreationStatus('creating')
    startCreationTimeout()

    void createWallet().catch(() => {
      createAttempted.current = false
      clearCreationTimeout()
      if (authenticatedRef.current) {
        setWalletCreationError('Privy no pudo crear la wallet. Puedes intentarlo de nuevo.')
        setWalletCreationStatus('error')
      } else {
        setWalletCreationError(null)
        setWalletCreationStatus('idle')
      }
    }).finally(() => {
      createInFlight.current = false
    })
  }, [createWallet, startCreationTimeout, clearCreationTimeout])

  const retryWalletCreation = useCallback(() => {
    if (wallet !== undefined) {
      setWalletCreationStatus('creating')
      setWalletCreationError(null)
      setWalletRetryNonce((nonce) => nonce + 1)
      return
    }
    if (walletCreationStatus !== 'error' || createInFlight.current) return
    createAttempted.current = false
    createEmbeddedWallet()
  }, [createEmbeddedWallet, wallet, walletCreationStatus])

  useEffect(() => {
    let cancelled = false
    if (!ready) return
    if (!authenticated) {
      setPrivyWallet(null)
      if (!createInFlight.current) {
        setWalletCreationStatus('idle')
        setWalletCreationError(null)
        createAttempted.current = false
        clearCreationTimeout()
      }
      return
    }
    if (!walletsReady) return
    if (wallet === undefined) {
      createEmbeddedWallet()
      return () => { cancelled = true }
    }

    const isAlreadyConnected = connectedConnector?.id === PRIVY_WALLET_CONNECTOR_ID
      && connectedAddress?.toLowerCase() === wallet.address.toLowerCase()
    if (!isAlreadyConnected) {
      setWalletCreationError(null)
      setWalletCreationStatus('creating')
      if (creationTimeout.current === null) startCreationTimeout()
    }

    void wallet.getEthereumProvider().then((provider) => {
      if (!cancelled) {
        const isEmbedded = wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'
        setPrivyWallet({
          address: wallet.address as `0x${string}`,
          provider: provider as PrivyProviderLike,
          chainId: Number(wallet.chainId.split(':').pop()),
          embedded: isEmbedded,
        })
        const connector = connectors.find((item) => item.id === PRIVY_WALLET_CONNECTOR_ID)
        if (connector === undefined) {
          clearCreationTimeout()
          setWalletCreationError('No se encontró el conector de wallet de la app. Inténtalo otra vez.')
          setWalletCreationStatus('error')
          return
        }
        if (!isAlreadyConnected) {
          void connectAsync({ connector } as never).then(() => {
            if (!cancelled) {
              clearCreationTimeout()
              setWalletCreationError(null)
              setWalletCreationStatus('idle')
            }
          }).catch(() => {
            if (!cancelled) {
              clearCreationTimeout()
              setWalletCreationError('La wallet existe, pero no se pudo conectar a la app. Inténtalo otra vez.')
              setWalletCreationStatus('error')
            }
          })
        }
        if (isAlreadyConnected) {
          clearCreationTimeout()
          setWalletCreationError(null)
          setWalletCreationStatus('idle')
        }
      }
    }).catch(() => {
      if (!cancelled) {
        clearCreationTimeout()
        setWalletCreationError('No se pudo preparar el acceso a tu wallet. Inténtalo otra vez.')
        setWalletCreationStatus('error')
      }
    })
    return () => { cancelled = true }
  }, [
    ready,
    authenticated,
    walletsReady,
    wallet,
    connectors,
    connectAsync,
    connectedConnector,
    connectedAddress,
    clearCreationTimeout,
    createEmbeddedWallet,
    walletRetryNonce,
    startCreationTimeout,
  ])

  useEffect(() => () => clearCreationTimeout(), [clearCreationTimeout])

  const value = useMemo<EmbeddedAuth>(
    () => ({ enabled: true, ready, authenticated, login, logout, walletCreationStatus, walletCreationError, retryWalletCreation }),
    [ready, authenticated, login, logout, walletCreationStatus, walletCreationError, retryWalletCreation],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined
  if (appId === undefined || appId.trim() === '') return <AuthContext.Provider value={unavailable}>{children}</AuthContext.Provider>
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethodsAndOrder: {
          primary: ['google', 'twitter', 'discord', 'twitch'],
          overflow: ['email', 'detected_ethereum_wallets', 'wallet_connect'],
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'off' },
        },
      }}
    >
      <PrivySession>{children}</PrivySession>
    </PrivyProvider>
  )
}
