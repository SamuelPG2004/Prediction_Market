import React, { useState } from 'react';
import {
  X,
  Gavel,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { OutcomeType, PredictionMarket, UserPosition } from '../types';
import { formatCurrency } from '../utils/formatters';

interface ResolveMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: PredictionMarket | null;
  positions: UserPosition[];
  onResolve: (marketId: string, outcome: OutcomeType) => void;
  onDelete: (marketId: string) => void;
}

/**
 * Cierre de un mercado propio.
 *
 * Al resolver, cada share del resultado ganador paga $1 y las del perdedor $0.
 * Muestra de antemano cuánto cobrarías con cada opción, para que la decisión
 * sea informada y no una sorpresa.
 */
export const ResolveMarketModal: React.FC<ResolveMarketModalProps> = ({
  isOpen,
  onClose,
  market,
  positions,
  onResolve,
  onDelete,
}) => {
  const [confirming, setConfirming] = useState<OutcomeType | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!isOpen || !market) return null;

  const marketPositions = positions.filter((p) => p.marketId === market.id);
  const yesShares = marketPositions
    .filter((p) => p.outcome === 'YES')
    .reduce((acc, p) => acc + p.sharesCount, 0);
  const noShares = marketPositions
    .filter((p) => p.outcome === 'NO')
    .reduce((acc, p) => acc + p.sharesCount, 0);
  const totalCost = marketPositions.reduce((acc, p) => acc + p.totalCostUsd, 0);

  const handleResolve = (outcome: OutcomeType) => {
    if (confirming !== outcome) {
      setConfirming(outcome);
      return;
    }
    onResolve(market.id, outcome);
    setConfirming(null);
    onClose();
  };

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete(market.id);
    setConfirmingDelete(false);
    onClose();
  };

  const close = () => {
    setConfirming(null);
    setConfirmingDelete(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in"
        onClick={close}
      />

      <div className="relative w-full max-w-md rounded-2xl bg-[#0f121a] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-start justify-between bg-[#131620]">
          <div className="flex items-start gap-2.5 pr-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <Gavel className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">
                Resolver mercado
              </h3>
              <p className="text-[11px] text-neutral-400 line-clamp-2 mt-0.5">
                {market.title}
              </p>
            </div>
          </div>

          <button
            onClick={close}
            className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Resumen de exposición */}
          <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3.5 flex flex-col gap-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-neutral-500">Shares SÍ</span>
              <span className="text-emerald-400 font-bold">
                {yesShares.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Shares NO</span>
              <span className="text-rose-400 font-bold">
                {noShares.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-neutral-800/80">
              <span className="text-neutral-500">Invertido</span>
              <span className="text-neutral-200 font-bold">
                {formatCurrency(totalCost)}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-neutral-400 leading-relaxed">
            Elige el resultado real. Cada share ganadora se paga a{' '}
            <span className="font-mono text-neutral-200">$1.00</span> y las
            perdedoras a{' '}
            <span className="font-mono text-neutral-200">$0.00</span>. Esta
            acción cierra el mercado y no se puede deshacer.
          </p>

          {/* Botones de resolución */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleResolve('YES')}
              className={`flex flex-col items-center gap-1 py-3.5 rounded-xl border font-bold text-sm transition-all active:scale-95 ${
                confirming === 'YES'
                  ? 'bg-emerald-500 text-black border-emerald-400'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{confirming === 'YES' ? '¿Confirmar SÍ?' : 'Ganó SÍ'}</span>
              <span className="text-[10px] font-mono font-normal opacity-80">
                cobras {formatCurrency(yesShares)}
              </span>
            </button>

            <button
              onClick={() => handleResolve('NO')}
              className={`flex flex-col items-center gap-1 py-3.5 rounded-xl border font-bold text-sm transition-all active:scale-95 ${
                confirming === 'NO'
                  ? 'bg-rose-500 text-black border-rose-400'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
              }`}
            >
              <XCircle className="w-5 h-5" />
              <span>{confirming === 'NO' ? '¿Confirmar NO?' : 'Ganó NO'}</span>
              <span className="text-[10px] font-mono font-normal opacity-80">
                cobras {formatCurrency(noShares)}
              </span>
            </button>
          </div>

          {confirming && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-[11px] text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Pulsa de nuevo para confirmar. El mercado quedará cerrado
                permanentemente.
              </span>
            </div>
          )}

          {/* Eliminar mercado */}
          <button
            onClick={handleDelete}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
              confirmingDelete
                ? 'bg-rose-500 text-black border-rose-400'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-rose-400 hover:border-rose-500/30'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {confirmingDelete
                ? '¿Eliminar de verdad?'
                : 'Eliminar mercado y devolver lo invertido'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
