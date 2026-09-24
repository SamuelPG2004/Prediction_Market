import React, { createContext, useContext, useEffect, useMemo } from 'react'
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { useConnect } from 'wagmi'
import { PRIVY_WALLET_CONNECTOR_ID, setPrivyEmbeddedWallet, type PrivyProviderLike } from '../config/privyWalletConnector'

interface EmbeddedAuth {
  enabled: boolean
  ready: boolean
  authenticated: boolean
  login: () => void
  logout: () => Promise<void>
}
const unavailable: EmbeddedAuth = { enabled: false, ready: true, authenticated: false, login: () => {}, logout: async () => {} }
const AuthContext = createContext<EmbeddedAuth>(unavailable)
export const useEmbeddedAuth = () => useContext(AuthContext)

function PrivySession({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const { connect, connectors } = useConnect()
  const wallet = wallets.find((item) => item.type === 'ethereum' && item.walletClientType === 'privy')

  useEffect(() => {
    let cancelled = false
    if (!authenticated || wallet === undefined) { setPrivyEmbeddedWallet(null); return }
    void wallet.getEthereumProvider().then((provider) => {
      if (!cancelled) {
        setPrivyEmbeddedWallet({ address: wallet.address as `0x${string}`, provider: provider as PrivyProviderLike, chainId: Number(wallet.chainId.split(':').pop()) })
        const connector = connectors.find((item) => item.id === PRIVY_WALLET_CONNECTOR_ID)
        if (connector !== undefined) connect({ connector } as never)
      }
    })
    return () => { cancelled = true }
  }, [authenticated, wallet, connectors, connect])

  const value = useMemo<EmbeddedAuth>(
    () => ({ enabled: true, ready, authenticated, login, logout }),
    [ready, authenticated, login, logout],
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
        loginMethods: ['google', 'twitter', 'email', 'wallet', 'discord', 'twitch'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      <PrivySession>{children}</PrivySession>
    </PrivyProvider>
  )
}
