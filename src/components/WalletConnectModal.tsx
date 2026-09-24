import React, { useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  LogOut,
  Wallet,
  X,
} from 'lucide-react'
import { useWallet } from '../services/web3Service'
import { useVenueBalances } from '../hooks/useVenueBalances'
import { chainLabel, explorerAddressUrl } from '../config/chains'
import { formatCurrency } from '../utils/formatters'

interface WalletConnectModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * La única entrada para usuarios nuevos es su cuenta Google o X. Privy crea
 * la wallet integrada durante el registro; aquí se muestra la dirección para
 * que puedan depositar directamente y usar los mercados.
 */
export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    address,
    isConnected,
    isConnecting,
    isEmbeddedWallet,
    connectError,
    disconnect,
    embeddedAuth,
    connectEmbedded,
  } = useWallet()
  const { balances, isLoading: balancesLoading } = useVenueBalances()
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  if (!isOpen) return null

  const copyAddress = async () => {
    if (address === null) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setCopyError(false)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
      setCopyError(true)
    }
  }

  const signOut = () => {
    const finish = () => {
      disconnect()
      onClose()
    }
    if (isEmbeddedWallet) {
      void embeddedAuth.logout().catch(() => undefined).finally(finish)
      return
    }
    finish()
  }

  const walletReady = isConnected && address !== null
  const preparingWallet = embeddedAuth.authenticated && !walletReady

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        className="relative w-full max-w-md max-h-[88vh] flex flex-col rounded-2xl bg-[#0d1017] border border-neutral-800/90 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-150"
      >
        <header className="shrink-0 p-5 border-b border-neutral-800 flex items-center justify-between bg-[#131620]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h2 id="wallet-modal-title" className="text-sm font-bold text-neutral-100">
                {walletReady ? 'Tu wallet Aether' : 'Entrar o registrarse'}
              </h2>
              <p className="text-[11px] text-neutral-400">
                {walletReady ? 'Lista para depositar y apostar' : 'Acceso sencillo con Google o X'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 sm:p-6 flex flex-col gap-4 overflow-y-auto">
          {isConnected && address !== null ? (
            <>
              <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
                <h3 className="text-sm font-semibold text-neutral-100">Dirección asignada</h3>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  Tu cuenta tiene una wallet propia. Envía fondos a esta dirección usando la red y el token correctos.
                </p>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-800 bg-[#090b0f] p-3">
                  <span
                    className="min-w-0 flex-1 break-all font-mono text-xs text-neutral-100"
                    title={address}
                  >
                    {address}
                  </span>
                  <button
                    type="button"
                    onClick={copyAddress}
                    aria-label={copied ? 'Dirección copiada' : 'Copiar dirección'}
                    title={copied ? 'Copiada' : 'Copiar dirección'}
                    className="shrink-0 rounded-md p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-emerald-400"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  {explorerAddressUrl(137, address) !== null && (
                    <a
                      href={explorerAddressUrl(137, address) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Abrir dirección en el explorador"
                      title="Ver en PolygonScan"
                      className="shrink-0 rounded-md p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-emerald-400"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                {copyError && (
                  <p role="alert" className="mt-2 text-[11px] text-rose-300">
                    No se pudo copiar. Selecciona la dirección y cópiala manualmente.
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-neutral-800 bg-[#11151e] p-4">
                <h3 className="text-xs font-semibold text-neutral-200">Dónde depositar</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
                  Para jugar, deposita USDT por Polygon o USDC por Base en la dirección de arriba. Comprueba la red antes de enviar.
                </p>
              </section>

              <section className="rounded-xl border border-neutral-800 bg-[#090b0f] p-4">
                <div className="mb-3 flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-neutral-500" />
                  <h3 className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                    Saldos disponibles
                  </h3>
                </div>
                <div className="flex flex-col gap-2">
                  {balances.map((balance) => (
                    <div
                      key={balance.venue}
                      className="flex items-center justify-between text-xs font-mono"
                    >
                      <span className="text-neutral-400">
                        {balance.symbol} · {chainLabel(balance.chainId)}
                      </span>
                      <span className="font-semibold text-neutral-100">
                        {balancesLoading && balance.balance === null ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500" />
                        ) : balance.balance === null ? (
                          '—'
                        ) : (
                          formatCurrency(balance.balance)
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <p className="text-[11px] leading-relaxed text-neutral-500">
                Cada apuesta se confirma con tu firma. La app no mueve tus fondos por su cuenta.
              </p>

              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 py-2.5 text-xs font-semibold text-neutral-300 transition-colors hover:border-rose-500/30 hover:bg-rose-500/5 hover:text-rose-300"
              >
                <LogOut className="h-3.5 w-3.5" />
                Cerrar sesión
              </button>
            </>
          ) : preparingWallet || isConnecting ? (
            <div role="status" className="flex flex-col items-center gap-3 rounded-xl border border-neutral-800 bg-[#11151e] px-5 py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-neutral-100">Preparando tu wallet</p>
                <p className="mt-1 text-xs text-neutral-400">Esto puede tardar unos segundos.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-neutral-800 bg-[#11151e] p-4">
                <h3 className="text-sm font-semibold text-neutral-100">Una cuenta, una wallet</h3>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  Regístrate con Google o X. Te asignamos una dirección para depositar y jugar; no necesitas instalar una extensión ni crear una wallet manualmente.
                </p>
              </div>

              {embeddedAuth.enabled ? (
                <button
                  type="button"
                  onClick={connectEmbedded}
                  disabled={!embeddedAuth.ready}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-[#07110d] transition-colors hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
                >
                  {embeddedAuth.ready ? (
                    <>
                      <span>Continuar con Google o X</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Preparando acceso…</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>El registro con Google o X no está disponible ahora. Inténtalo más tarde.</span>
                </div>
              )}

              {connectError && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>No se pudo preparar la wallet. Cierra esta ventana e inténtalo de nuevo.</span>
                </div>
              )}

              <p className="text-center text-[11px] leading-relaxed text-neutral-500">
                Explorar los mercados es gratis. Cada apuesta requiere tu firma y usa fondos reales.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
