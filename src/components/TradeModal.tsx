import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertCircle,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { PredictionMarket, OutcomeType, WalletState } from '../types';
import {
  formatCurrency,
  formatPercent,
  calculateTradeEstimates,
} from '../utils/formatters';

export type ExecuteTradeResult =
  | { ok: true; shares: number }
  | { ok: false; error: string };

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: PredictionMarket | null;
  initialOutcome: OutcomeType;
  wallet: WalletState;
  onConnectWallet: () => void;
  onExecuteTrade: (tradeData: {
    marketId: string;
    outcome: OutcomeType;
    amountUsd: number;
  }) => ExecuteTradeResult;
}

/**
 * Compra de shares contra tu saldo de práctica.
 *
 * La versión anterior simulaba un flujo on-chain de 3 pasos (aprobar USDC,
 * firmar, minar bloque) que no ocurría: la llamada al contrato apuntaba a una
 * función inexistente. Ahora la orden se liquida de inmediato contra el store
 * local, que es lo que realmente pasa.
 */
export const TradeModal: React.FC<TradeModalProps> = ({
  isOpen,
  onClose,
  market,
  initialOutcome,
  wallet,
  onConnectWallet,
  onExecuteTrade,
}) => {
  const [outcome, setOutcome] = useState<OutcomeType>(initialOutcome);
  const [amountUsd, setAmountUsd] = useState<string>('100');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [filled, setFilled] = useState<{ shares: number; cost: number } | null>(
    null,
  );

  useEffect(() => {
    setOutcome(initialOutcome);
    setErrorMessage('');
    setFilled(null);
  }, [initialOutcome, isOpen, market?.id]);

  if (!isOpen || !market) return null;

  const numericAmount = parseFloat(amountUsd) || 0;
  const currentPrice =
    outcome === 'YES' ? market.yesPriceUsd : market.noPriceUsd;
  const estimates = calculateTradeEstimates(numericAmount, currentPrice);

  const isResolved = market.status !== 'active';
  const hasInsufficientBalance = numericAmount > wallet.usdcBalance;
  const canSubmit =
    numericAmount > 0 && !hasInsufficientBalance && !isResolved;

  const handleQuickPercent = (pct: number) => {
    setAmountUsd((wallet.usdcBalance * (pct / 100)).toFixed(2));
  };

  const handleConfirmOrder = () => {
    if (!canSubmit) return;
    setErrorMessage('');

    const result = onExecuteTrade({
      marketId: market.id,
      outcome,
      amountUsd: numericAmount,
    });

    if (result.ok) {
      setFilled({ shares: result.shares, cost: numericAmount });
    } else {
      setErrorMessage(result.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg rounded-2xl bg-[#0f121a] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-start justify-between bg-[#131722]">
          <div className="pr-2">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                {market.category}
              </span>
              <span className="text-xs font-mono text-neutral-400">
                Resolución: {market.resolutionSource}
              </span>
            </div>
            <h3 className="text-sm font-bold text-neutral-100 line-clamp-2">
              {market.title}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {filled ? (
            /* Recibo */
            <div className="py-6 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-neutral-100">
                  Orden registrada
                </h4>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                  Compraste{' '}
                  <span className="font-mono font-bold text-emerald-400">
                    {filled.shares.toFixed(2)} shares
                  </span>{' '}
                  de{' '}
                  <span className="font-mono font-bold text-neutral-200">
                    {outcome === 'YES' ? 'SÍ' : 'NO'}
                  </span>
                  .
                </p>
              </div>

              <div className="w-full rounded-xl bg-[#090b0f] border border-neutral-800 p-3.5 flex flex-col gap-2 text-xs font-mono text-left">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Costo</span>
                  <span className="text-neutral-200 font-bold">
                    {formatCurrency(filled.cost)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Pago si aciertas</span>
                  <span className="text-emerald-400 font-bold">
                    {formatCurrency(filled.shares)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-neutral-800/80">
                  <span className="text-neutral-500">Saldo restante</span>
                  <span className="text-neutral-200 font-bold">
                    {formatCurrency(wallet.usdcBalance)}
                  </span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                <Layers className="w-4 h-4" />
                <span>Listo</span>
              </button>
            </div>
          ) : (
            <>
              {isResolved && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-neutral-800/60 border border-neutral-700 text-neutral-300 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Este mercado ya está resuelto
                    {market.resolvedOutcome
                      ? `: ganó ${market.resolvedOutcome === 'YES' ? 'SÍ' : 'NO'}`
                      : ''}
                    . No acepta más órdenes.
                  </span>
                </div>
              )}

              {/* Selección de resultado */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOutcome('YES')}
                  disabled={isResolved}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center transition-all disabled:opacity-50 ${
                    outcome === 'YES'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/50'
                      : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>SÍ</span>
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-400 mt-1">
                    {market.yesProbability}% • ${market.yesPriceUsd.toFixed(2)}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOutcome('NO')}
                  disabled={isResolved}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center transition-all disabled:opacity-50 ${
                    outcome === 'NO'
                      ? 'bg-rose-500/15 border-rose-500 text-rose-300 ring-1 ring-rose-500/50'
                      : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>NO</span>
                  </div>
                  <div className="text-xs font-mono font-bold text-rose-400 mt-1">
                    {market.noProbability}% • ${market.noPriceUsd.toFixed(2)}
                  </div>
                </button>
              </div>

              {/* Monto */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400 font-medium">
                    Monto a invertir
                  </span>
                  <span className="text-neutral-400 font-mono text-[11px]">
                    Práctica:{' '}
                    <span className="text-neutral-200 font-bold">
                      {formatCurrency(wallet.usdcBalance)}
                    </span>
                  </span>
                </div>

                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-mono font-bold text-sm">
                    $
                  </div>
                  <input
                    type="number"
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    disabled={isResolved}
                    className="w-full bg-[#0a0c12] text-neutral-100 font-mono font-bold text-lg rounded-xl pl-8 pr-4 py-3 border border-neutral-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 mt-1">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleQuickPercent(pct)}
                      disabled={isResolved}
                      className="py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800/80 text-[11px] font-mono text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-50"
                    >
                      {pct === 100 ? 'MAX' : `${pct}%`}
                    </button>
                  ))}
                </div>

                {hasInsufficientBalance && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-400 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Saldo de práctica insuficiente. Puedes recargarlo desde el
                      panel principal.
                    </span>
                  </div>
                )}
              </div>

              {/* Cálculos */}
              <div className="rounded-xl bg-[#090b10] border border-neutral-800/80 p-3.5 flex flex-col gap-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Shares estimadas</span>
                  <span className="text-neutral-100 font-bold">
                    {estimates.shares.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Precio por share</span>
                  <span className="text-neutral-200">
                    ${currentPrice.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Pago si aciertas</span>
                  <span className="text-emerald-400 font-bold">
                    {formatCurrency(estimates.potentialPayoutUsd)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Ganancia neta / ROI</span>
                  <span className="text-emerald-400 font-bold">
                    +{formatCurrency(estimates.netProfitUsd)} (
                    {formatPercent(estimates.roiPercentage, true)})
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                onClick={handleConfirmOrder}
                disabled={!canSubmit}
                className={`w-full py-3 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 active:scale-98 ${
                  !canSubmit
                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                    : outcome === 'YES'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black shadow-emerald-500/20'
                      : 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white shadow-rose-500/20'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  Comprar {outcome === 'YES' ? 'SÍ' : 'NO'} por{' '}
                  {formatCurrency(numericAmount)}
                </span>
              </button>

              {!wallet.isConnected && (
                <button
                  onClick={onConnectWallet}
                  className="text-[11px] text-center text-neutral-500 hover:text-neutral-300 transition-colors underline decoration-dotted"
                >
                  Conectar wallet (opcional, solo para identidad)
                </button>
              )}

              <p className="text-[11px] text-center text-neutral-500">
                Orden liquidada con saldo de práctica. No hay dinero real ni
                comisiones de red.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
