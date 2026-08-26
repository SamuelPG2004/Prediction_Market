import React, { useState } from 'react';
import {
  X,
  Wallet,
  Check,
  Copy,
  LogOut,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Eye,
} from 'lucide-react';
import { useWallet, polygonscanAddressUrl } from '../services/web3Service';
import { formatCurrency, shortenAddress } from '../utils/formatters';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFaucet: () => void;
}

/**
 * Conexión de wallet. Real, vía wagmi.
 *
 * Alcance: identidad y lectura. Conectar te da tu dirección y muestra tu saldo
 * real de USDC en Polygon en modo solo lectura. La app nunca firma ni envía
 * transacciones, y no gasta ese saldo: para apostar usa el saldo de práctica.
 */
export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({
  isOpen,
  onClose,
  onOpenFaucet,
}) => {
  const {
    address,
    isConnected,
    isCorrectChain,
    connect,
    connectors,
    isConnecting,
    connectError,
    disconnect,
    switchToPolygon,
    usdcBalance,
    isBalanceLoading,
  } = useWallet();

  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm rounded-2xl bg-[#0f121a] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-[#131620]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">
                {isConnected ? 'Wallet conectada' : 'Conectar wallet'}
              </h3>
              <p className="text-[11px] text-neutral-400">
                Solo identidad y lectura
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {isConnected && address ? (
            <>
              {/* Dirección */}
              <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3.5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
                    Dirección
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCopy}
                      title="Copiar dirección"
                      className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 transition-colors"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={polygonscanAddressUrl(address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver en Polygonscan"
                      className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
                <span className="text-sm font-mono text-neutral-100 break-all">
                  {shortenAddress(address, 8)}
                </span>
              </div>

              {/* Red incorrecta */}
              {!isCorrectChain && (
                <div className="flex flex-col gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3">
                  <div className="flex items-start gap-2 text-[11px] text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Estás en otra red. Cambia a Polygon para leer tu saldo de
                      USDC.
                    </span>
                  </div>
                  <button
                    onClick={switchToPolygon}
                    className="py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all active:scale-95"
                  >
                    Cambiar a Polygon
                  </button>
                </div>
              )}

              {/* Saldo on-chain, solo lectura */}
              <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3 h-3 text-neutral-500" />
                  <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
                    USDC en Polygon · solo lectura
                  </span>
                </div>
                <span className="text-lg font-mono font-bold text-neutral-100">
                  {isBalanceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
                  ) : (
                    formatCurrency(usdcBalance)
                  )}
                </span>
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  La app no toca este saldo. Para apostar usa tu saldo de
                  práctica.
                </p>
              </div>

              <button
                onClick={onOpenFaucet}
                className="w-full py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:text-amber-400 transition-all active:scale-95"
              >
                Gestionar saldo de práctica
              </button>

              <button
                onClick={() => {
                  disconnect();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-bold text-rose-400 transition-all active:scale-95"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Desconectar</span>
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Conectar es opcional. Solo añade tu dirección como identidad y
                te muestra tu saldo real de USDC. Puedes usar toda la app sin
                conectar nada.
              </p>

              <div className="flex flex-col gap-2">
                {connectors.map((connector) => (
                  <button
                    key={connector.uid}
                    onClick={() => connect({ connector })}
                    disabled={isConnecting}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/30 text-sm font-semibold text-neutral-200 transition-all active:scale-98 disabled:opacity-50"
                  >
                    <span>{connector.name}</span>
                    {isConnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
                    ) : (
                      <Wallet className="w-4 h-4 text-emerald-400" />
                    )}
                  </button>
                ))}

                {connectors.length === 0 && (
                  <div className="flex items-start gap-2 rounded-xl bg-neutral-900/70 border border-neutral-800 p-3 text-[11px] text-neutral-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      No se detectó ninguna wallet. Instala MetaMask o similar
                      si quieres conectar una.
                    </span>
                  </div>
                )}
              </div>

              {connectError && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 p-3 text-[11px] text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{connectError.message}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
