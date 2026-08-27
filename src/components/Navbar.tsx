import React, { useState } from 'react';
import { Wallet, Sparkles, Layers, Check, Copy } from 'lucide-react';
import { useWallet } from '../services/web3Service';
import { shortenAddress } from '../utils/formatters';

interface NavbarProps {
  onConnectWalletClick: () => void;
  onOpenPositionsClick: () => void;
}

/**
 * Barra superior. Identidad de la wallet y acceso a las posiciones reales.
 * Los saldos por venue viven en la vista y en el modal de wallet.
 */
export const Navbar: React.FC<NavbarProps> = ({
  onConnectWalletClick,
  onOpenPositionsClick,
}) => {
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wallet.address !== null) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800/80 bg-[#0d0f14]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Marca */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1.5px] shadow-lg shadow-emerald-500/10">
              <div className="w-full h-full bg-[#0b0d12] rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-emerald-400 group-hover:rotate-12 transition-transform duration-300" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-lg tracking-wider text-neutral-100">
                  AETHER
                </span>
                <span className="text-[10px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  Real
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 -mt-0.5 font-medium hidden sm:block">
                Prediction Markets
              </p>
            </div>
          </div>

          {/* Indicador de dinero real */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs bg-rose-500/10 border-rose-500/30 text-rose-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-rose-400" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            <span className="font-mono font-semibold">Dinero real</span>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            id="btn-toggle-positions"
            onClick={onOpenPositionsClick}
            className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800/90 border border-neutral-800 text-xs font-medium text-neutral-200 transition-all active:scale-95"
          >
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Mis posiciones</span>
          </button>

          {/* Redes soportadas */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs font-mono text-purple-300">
            <div className="w-2 h-2 rounded-full bg-purple-400 shadow-sm shadow-purple-400/50" />
            <span>Polygon · Base</span>
          </div>

          {/* Wallet */}
          {wallet.isConnected && wallet.address !== null ? (
            <div
              onClick={onConnectWalletClick}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#141822] hover:bg-[#1a202d] border border-neutral-700/80 cursor-pointer transition-all shadow-sm group text-xs font-mono text-neutral-200"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span>{shortenAddress(wallet.address)}</span>
              <button
                onClick={handleCopyAddress}
                className="p-1 hover:text-emerald-400 transition-colors ml-0.5"
                title="Copiar dirección"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 text-neutral-400" />
                )}
              </button>
            </div>
          ) : (
            <button
              id="btn-connect-wallet"
              onClick={onConnectWalletClick}
              className="relative group overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-95"
            >
              <Wallet className="w-4 h-4 text-black group-hover:scale-110 transition-transform" />
              <span>Conectar wallet</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
