import React, { useState } from 'react';
import { X, Wallet, CheckCircle2, Info } from 'lucide-react';
import { WalletState } from '../types';
import { formatCurrency } from '../utils/formatters';

interface FaucetModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: WalletState;
  onAddFunds: (amountUsd: number) => void;
}

const PRESET_AMOUNTS = [1_000, 5_000, 10_000];

/**
 * Recarga de saldo de práctica.
 *
 * Antes esto se presentaba como un "faucet de USDC" en Polygon Mainnet: fingía
 * una transacción con un hash aleatorio y acreditaba saldo inventado. Como en
 * mainnet no existe ningún faucet de USDC, eso podía hacer creer que había
 * fondos reales. Ahora se llama por su nombre.
 */
export const FaucetModal: React.FC<FaucetModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onAddFunds,
}) => {
  const [customAmount, setCustomAmount] = useState('');
  const [justAdded, setJustAdded] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleAdd = (amount: number) => {
    if (!(amount > 0)) return;
    onAddFunds(amount);
    setJustAdded(amount);
    setCustomAmount('');
    window.setTimeout(() => setJustAdded(null), 2000);
  };

  const customValue = parseFloat(customAmount) || 0;

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
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">
                Saldo de práctica
              </h3>
              <p className="text-[11px] text-neutral-400">
                Fichas para apostar, sin dinero real
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
          {/* Saldo actual */}
          <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3.5">
            <div className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
              Saldo actual
            </div>
            <div className="text-2xl font-mono font-bold text-neutral-100 mt-1">
              {formatCurrency(wallet.usdcBalance)}
            </div>
          </div>

          {justAdded !== null && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Añadidos {formatCurrency(justAdded)} de práctica.</span>
            </div>
          )}

          {/* Montos predefinidos */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-neutral-400">
              Añadir saldo
            </span>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => handleAdd(amount)}
                  className="py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-amber-500/30 text-xs font-mono font-bold text-neutral-200 hover:text-amber-400 transition-all active:scale-95"
                >
                  +{amount.toLocaleString('en-US')}
                </button>
              ))}
            </div>
          </div>

          {/* Monto personalizado */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-sm">
                $
              </span>
              <input
                type="number"
                min="0"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Otro monto"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-[#090b0f] border border-neutral-800 focus:border-amber-500/50 focus:outline-none text-sm font-mono text-neutral-100 placeholder:text-neutral-600"
              />
            </div>
            <button
              onClick={() => handleAdd(customValue)}
              disabled={!(customValue > 0)}
              className="px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-bold text-xs transition-all active:scale-95"
            >
              Añadir
            </button>
          </div>

          {/* Nota honesta */}
          <div className="flex items-start gap-2 rounded-xl bg-neutral-900/70 border border-neutral-800 p-3 text-[11px] text-neutral-400 leading-relaxed">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neutral-500" />
            <span>
              Este saldo es ficticio y solo sirve para llevar la cuenta de tus
              predicciones. No es USDC ni ningún activo real, y no sale de este
              navegador.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
