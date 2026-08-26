import React from 'react';
import { 
  Clock, 
  Activity, 
  DollarSign, 
  Lock, 
  TrendingUp, 
  TrendingDown, 
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { PredictionMarket, OutcomeType } from '../types';
import { 
  formatCompactNumber, 
  getTimeRemaining 
} from '../utils/formatters';

interface MarketCardProps {
  market: PredictionMarket;
  onTradeClick: (market: PredictionMarket, outcome: OutcomeType) => void;
  onDetailsClick: (market: PredictionMarket) => void;
  /** Mercado privado cuyo código de acceso aún no se ha introducido. */
  locked?: boolean;
}

export const MarketCard: React.FC<MarketCardProps> = ({
  market,
  onTradeClick,
  onDetailsClick,
  locked = false,
}) => {
  const timeRemaining = getTimeRemaining(market.resolutionDate);
  const isResolved = market.status === 'resolved';

  // Generate SVG path for sparkline
  const generateSparklinePath = (points: number[]) => {
    if (!points || points.length < 2) return '';
    const width = 120;
    const height = 28;
    const min = Math.min(...points) - 5;
    const max = Math.max(...points) + 5;
    const range = max - min || 1;

    return points
      .map((val, idx) => {
        const x = (idx / (points.length - 1)) * width;
        const y = height - ((val - min) / range) * height;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const isTrendingUp = market.sparkline && market.sparkline[market.sparkline.length - 1] >= market.sparkline[0];

  /* Mercado privado bloqueado: se muestra el marco pero no el contenido. */
  if (locked) {
    return (
      <div className="relative rounded-2xl bg-gradient-to-b from-[#141722]/90 to-[#0e1017]/95 border border-violet-500/25 p-5 flex flex-col items-center justify-center gap-3 min-h-[260px] shadow-lg">
        <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/25 text-violet-400">
          <Lock className="w-6 h-6" />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-bold text-neutral-200">
            Mercado privado
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Introduce el código para verlo
          </p>
        </div>
        <button
          onClick={() => onDetailsClick(market)}
          className="mt-1 px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-black text-xs font-bold transition-all active:scale-95"
        >
          Desbloquear
        </button>
      </div>
    );
  }

  return (
    <div className={`group relative rounded-2xl bg-gradient-to-b from-[#141722]/90 to-[#0e1017]/95 border transition-all duration-300 p-5 flex flex-col justify-between gap-4 shadow-lg hover:shadow-2xl hover:shadow-emerald-500/5 ${
      isResolved
        ? 'border-neutral-800/50 opacity-75'
        : 'border-neutral-800/80 hover:border-neutral-700 hover:-translate-y-0.5'
    }`}>

      {/* Top Header: Badge, Category & Expiry */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {market.isPrivate ? (
            <span className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Lock className="w-3 h-3 text-amber-400" />
              Sindicato Privado
            </span>
          ) : (
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-800/80 text-neutral-300 border border-neutral-700/50">
              {market.category}
            </span>
          )}

          {market.badge && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              {market.badge}
            </span>
          )}
        </div>

        {/* Expiry Badge */}
        <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-400" title={`Fecha de resolución: ${market.resolutionDate}`}>
          <Clock className={`w-3 h-3 ${timeRemaining.isUrgent ? 'text-amber-400 animate-pulse' : 'text-neutral-500'}`} />
          <span className={timeRemaining.isUrgent ? 'text-amber-400 font-semibold' : 'text-neutral-400'}>
            {timeRemaining.label}
          </span>
        </div>
      </div>

      {/* Main Question / Market Title */}
      <div 
        onClick={() => onDetailsClick(market)}
        className="cursor-pointer group-hover:text-white transition-colors"
      >
        <h3 className="text-base font-bold text-neutral-100 leading-snug line-clamp-2 hover:underline decoration-neutral-600 underline-offset-4">
          {market.title}
        </h3>
        <p className="text-xs text-neutral-400 line-clamp-2 mt-1.5 leading-relaxed">
          {market.description}
        </p>
      </div>

      {/* Probability Gauge & Sparkline Section */}
      <div className="rounded-xl bg-[#0a0c11]/80 border border-neutral-800/60 p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-extrabold text-emerald-400">
              {market.yesProbability}%
            </span>
            <span className="text-xs font-semibold text-emerald-300/80 uppercase font-mono">
              SÍ (YES)
            </span>
          </div>

          {/* Mini Sparkline Chart */}
          <div className="flex items-center gap-2">
            <div className="w-[100px] h-6 flex items-center justify-center">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 120 28">
                <path
                  d={generateSparklinePath(market.sparkline)}
                  fill="none"
                  stroke={isTrendingUp ? '#10b981' : '#f43f5e'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className={`text-[10px] font-mono font-bold flex items-center ${isTrendingUp ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isTrendingUp ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
              7d
            </div>
          </div>

          <div className="flex items-baseline gap-2 text-right">
            <span className="text-xs font-semibold text-rose-400/80 uppercase font-mono">
              NO
            </span>
            <span className="text-2xl font-mono font-extrabold text-rose-400">
              {market.noProbability}%
            </span>
          </div>
        </div>

        {/* Dual Progress Meter Bar */}
        <div className="relative w-full h-2 rounded-full bg-neutral-900 overflow-hidden flex">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
            style={{ width: `${market.yesProbability}%` }}
          />
          <div 
            className="h-full bg-gradient-to-r from-rose-500 to-red-600 transition-all duration-500"
            style={{ width: `${market.noProbability}%` }}
          />
        </div>
      </div>

      {/* Volume & Liquidity Footer Info */}
      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 border-t border-neutral-800/50 pt-2.5">
        <div className="flex items-center gap-1.5" title="Volumen acumulado en las últimas 24h">
          <Activity className="w-3 h-3 text-neutral-500" />
          <span>Vol:</span>
          <span className="text-neutral-200 font-semibold">${formatCompactNumber(market.volume24hUsd)}</span>
        </div>
        <div className="flex items-center gap-1.5" title="Liquidez bloqueada en el Automated Market Maker">
          <DollarSign className="w-3 h-3 text-neutral-500" />
          <span>Pool:</span>
          <span className="text-neutral-200 font-semibold">${formatCompactNumber(market.totalLiquidityUsd)}</span>
        </div>
        <button
          onClick={() => onDetailsClick(market)}
          className="text-neutral-400 hover:text-white flex items-center gap-0.5 text-[11px] font-sans hover:underline"
        >
          <span>Reglas</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Mercado resuelto: se muestra el veredicto en lugar de los botones */}
      {isResolved ? (
        <div
          className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-sm ${
            market.resolvedOutcome === 'YES'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          {market.resolvedOutcome === 'YES' ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          <span>
            Resuelto: ganó {market.resolvedOutcome === 'YES' ? 'SÍ' : 'NO'}
          </span>
        </div>
      ) : (
      /* Action Buttons: Comprar Sí (YES) / Comprar No (NO) */
      <div className="grid grid-cols-2 gap-2.5 pt-1">

        {/* Buy YES Button */}
        <button
          id={`btn-buy-yes-${market.id}`}
          onClick={() => onTradeClick(market, 'YES')}
          className="relative group/btn flex flex-col items-center justify-center py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/30 hover:border-emerald-500/60 transition-all duration-150 active:scale-98 cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:scale-110 transition-transform" />
            <span className="text-xs font-bold text-emerald-300">Comprar Sí</span>
            <span className="text-[10px] font-mono text-emerald-400/80 font-bold uppercase">(YES)</span>
          </div>
          <span className="text-[11px] font-mono font-bold text-emerald-400 mt-0.5">
            ${market.yesPriceUsd.toFixed(2)} / share
          </span>
        </button>

        {/* Buy NO Button */}
        <button
          id={`btn-buy-no-${market.id}`}
          onClick={() => onTradeClick(market, 'NO')}
          className="relative group/btn flex flex-col items-center justify-center py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 border border-rose-500/30 hover:border-rose-500/60 transition-all duration-150 active:scale-98 cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-rose-400 group-hover/btn:scale-110 transition-transform" />
            <span className="text-xs font-bold text-rose-300">Comprar No</span>
            <span className="text-[10px] font-mono text-rose-400/80 font-bold uppercase">(NO)</span>
          </div>
          <span className="text-[11px] font-mono font-bold text-rose-400 mt-0.5">
            ${market.noPriceUsd.toFixed(2)} / share
          </span>
        </button>

      </div>
      )}
    </div>
  );
};
