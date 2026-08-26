import React, { useState } from 'react';
import { 
  Wallet, 
  Plus, 
  Coins, 
  Sparkles, 
  Layers, 
  Check, 
  Copy, 
} from 'lucide-react';
import { WalletState, SupportedNetwork } from '../types';
import { shortenAddress, formatCurrency } from '../utils/formatters';

interface NavbarProps {
  wallet: WalletState;
  positionsCount: number;
  totalPnlUsd: number;
  onConnectWalletClick: () => void;
  onOpenPositionsClick: () => void;
  onCreateMarketClick: () => void;
  onOpenFaucetClick: () => void;
  onSwitchNetwork: (network: SupportedNetwork) => void;
  /**
   * Modo activo. En 'real' el saldo mostrado es el USDC on-chain, no el de
   * práctica: enseñar saldo ficticio etiquetado como USDC junto a mercados de
   * dinero real es justo el tipo de confusión que hace perder dinero.
   */
  mode?: 'practice' | 'real';
  /** Saldo real de USDC en Polygon, solo relevante en modo 'real'. */
  onchainUsdcBalance?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  wallet,
  positionsCount,
  totalPnlUsd,
  onConnectWalletClick,
  onOpenPositionsClick,
  onCreateMarketClick,
  onOpenFaucetClick,
  onSwitchNetwork,
  mode = 'practice',
  onchainUsdcBalance = 0,
}) => {
  const isReal = mode === 'real';
  const shownBalance = isReal ? onchainUsdcBalance : wallet.usdcBalance;
  const balanceLabel = isReal ? 'USDC real' : 'Práctica';
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800/80 bg-[#0d0f14]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Brand / Logo */}
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
                <span className="text-[10px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  v2.4
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 -mt-0.5 font-medium hidden sm:block">
                Private Prediction Markets
              </p>
            </div>
          </div>

          {/* Indicador de modo */}
          <div
            className={`hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs ${
              isReal
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-neutral-900/90 border-neutral-800 text-neutral-300'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isReal ? 'bg-rose-400' : 'bg-emerald-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isReal ? 'bg-rose-500' : 'bg-emerald-500'
                }`}
              />
            </span>
            <span className="font-mono font-semibold">
              {isReal ? 'Dinero real' : 'Práctica'}
            </span>
          </div>
        </div>

        {/* Right: Actions & Web3 Wallet */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          
          {/* Acciones solo de práctica.
              En modo real se ocultan: "Crear mercado" y el saldo de práctica no
              existen ahí, y ofrecer el faucet ficticio junto a mercados de
              dinero real invita a confundir uno con otro. */}
          {!isReal && (
            <>
              <button
                id="btn-create-market"
                onClick={onCreateMarketClick}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/70 text-xs font-semibold text-neutral-200 hover:text-white transition-all shadow-sm active:scale-95"
                title="Crear mercado propio"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Crear Mercado</span>
              </button>

              <button
                id="btn-faucet"
                onClick={onOpenFaucetClick}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-medium text-neutral-300 transition-all active:scale-95"
                title="Saldo de práctica"
              >
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Práctica</span>
                <span className="sm:hidden font-mono">$</span>
              </button>
            </>
          )}

          {/* Posiciones: solo en práctica. El cajón muestra posiciones
              simuladas; en modo real tu exposición son las shares on-chain,
              que se ven dentro del panel de operación. */}
          {!isReal && (
          <button
            id="btn-toggle-positions"
            onClick={onOpenPositionsClick}
            className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800/90 border border-neutral-800 text-xs font-medium text-neutral-200 transition-all active:scale-95"
          >
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Mis Posiciones</span>
            {positionsCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[11px] font-bold border border-emerald-500/30">
                  {positionsCount}
                </span>
                <span className={`hidden md:inline font-mono text-[11px] ${totalPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPnlUsd >= 0 ? `+${formatCurrency(totalPnlUsd)}` : formatCurrency(totalPnlUsd)}
                </span>
              </span>
            )}
          </button>
          )}

          {/* Network Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs font-mono text-purple-300">
            <div className="w-2 h-2 rounded-full bg-purple-400 shadow-sm shadow-purple-400/50" />
            <span className="hidden sm:inline">Polygon</span>
          </div>

          {/* Connect Wallet / Connected State Pill */}
          {wallet.isConnected ? (
            <div 
              onClick={onConnectWalletClick}
              className="flex items-center gap-2 p-1 pl-2.5 rounded-xl bg-[#141822] hover:bg-[#1a202d] border border-neutral-700/80 cursor-pointer transition-all shadow-sm group"
            >
              {/* Saldo: real on-chain en modo real, práctica en modo práctica */}
              <div className="hidden sm:flex flex-col text-right pr-1">
                <span
                  className={`text-[10px] uppercase font-mono leading-tight ${
                    isReal ? 'text-rose-300' : 'text-neutral-400'
                  }`}
                >
                  {balanceLabel}
                </span>
                <span className="text-xs font-mono font-bold text-neutral-100">
                  {formatCurrency(shownBalance)}
                </span>
              </div>

              {/* Address Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900/90 border border-neutral-800 text-xs font-mono text-neutral-200 group-hover:border-neutral-700">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span>{shortenAddress(wallet.address || '0x0000000000000000000000000000000000000000')}</span>
                <button
                  onClick={handleCopyAddress}
                  className="p-1 hover:text-emerald-400 transition-colors ml-0.5"
                  title="Copiar Dirección"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-neutral-400" />}
                </button>
              </div>
            </div>
          ) : (
            <button
              id="btn-connect-wallet"
              onClick={onConnectWalletClick}
              className="relative group overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-95"
            >
              {/* TODO: Connect to Web3 / Smart Contract via Viem or Wagmi here */}
              <Wallet className="w-4 h-4 text-black group-hover:scale-110 transition-transform" />
              <span>Connect Wallet</span>
            </button>
          )}

        </div>
      </div>
    </header>
  );
};
