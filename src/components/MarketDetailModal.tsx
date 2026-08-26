import React from 'react';
import { 
  X, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle,
  FileText,
  History,
  Lock
} from 'lucide-react';
import { PredictionMarket, OutcomeType } from '../types';
import { 
  formatCurrency, 
  formatCompactNumber, 
  getTimeRemaining, 
} from '../utils/formatters';

interface MarketDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: PredictionMarket | null;
  onTradeClick: (market: PredictionMarket, outcome: OutcomeType) => void;
}

export const MarketDetailModal: React.FC<MarketDetailModalProps> = ({
  isOpen,
  onClose,
  market,
  onTradeClick,
}) => {
  if (!isOpen || !market) return null;

  const timeRemaining = getTimeRemaining(market.resolutionDate);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#0f121a] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-start justify-between bg-[#131722]">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                {market.category}
              </span>
              {market.isPrivate && (
                <span className="flex items-center gap-1 text-xs font-mono font-bold uppercase px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Lock className="w-3 h-3 text-amber-400" />
                  Sindicato Privado
                </span>
              )}
              {market.badge && (
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {market.badge}
                </span>
              )}
            </div>

            <h2 className="text-lg font-bold text-neutral-100 leading-snug">
              {market.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors ml-4"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
          
          {/* Key Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-[#090b0f] border border-neutral-800">
            <div>
              <span className="text-[10px] font-mono uppercase text-neutral-500">Probabilidad SÍ</span>
              <div className="text-lg font-mono font-extrabold text-emerald-400">
                {market.yesProbability}%
              </div>
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase text-neutral-500">Probabilidad NO</span>
              <div className="text-lg font-mono font-extrabold text-rose-400">
                {market.noProbability}%
              </div>
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase text-neutral-500">Volumen 24h</span>
              <div className="text-lg font-mono font-bold text-neutral-200">
                ${formatCompactNumber(market.volume24hUsd)}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase text-neutral-500">Tiempo Restante</span>
              <div className="text-sm font-mono font-semibold text-amber-400 mt-1">
                {timeRemaining.label}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-mono uppercase text-neutral-400 font-bold tracking-wider">
              Detalles del Mercado
            </h4>
            <p className="text-xs text-neutral-300 leading-relaxed bg-[#12151f] p-3.5 rounded-xl border border-neutral-800/80">
              {market.description}
            </p>
          </div>

          {/* Rules & Settlement Oracle */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-mono uppercase text-neutral-400 font-bold tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-neutral-400" />
              Reglas de Resolución & Oráculo
            </h4>
            <div className="rounded-xl bg-[#12151f] border border-neutral-800/80 p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-neutral-300 font-mono pb-2 border-b border-neutral-800">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Oráculo: <strong className="text-neutral-100">{market.resolutionSource}</strong></span>
              </div>
              <ul className="space-y-1.5 text-neutral-400 list-disc list-inside">
                {market.rules.map((rule, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recent Trade Activity Feed */}
          {market.recentTrades && market.recentTrades.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-mono uppercase text-neutral-400 font-bold tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-neutral-400" />
                Operaciones Recientes (Order Flow)
              </h4>
              <div className="rounded-xl bg-[#090b0f] border border-neutral-800 divide-y divide-neutral-800/60 overflow-hidden text-xs font-mono">
                {market.recentTrades.map((trade, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        trade.type === 'YES' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {trade.type === 'YES' ? 'SÍ' : 'NO'}
                      </span>
                      <span className="text-neutral-400">{trade.wallet}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-neutral-200 font-bold">{formatCurrency(trade.amountUsd)}</span>
                      <span className="text-neutral-500 text-[10px]">{trade.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fast Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => {
                onClose();
                onTradeClick(market, 'YES');
              }}
              className="py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Comprar SÍ (${market.yesPriceUsd.toFixed(2)})</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onTradeClick(market, 'NO');
              }}
              className="py-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98"
            >
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>Comprar NO (${market.noPriceUsd.toFixed(2)})</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
