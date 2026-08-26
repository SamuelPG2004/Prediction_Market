import React from 'react';
import { TrendingUp, Activity, DollarSign, ShieldCheck, Zap } from 'lucide-react';
import { formatCompactNumber } from '../utils/formatters';

interface StatsTickerProps {
  totalVolume24h: number;
  totalLiquidity: number;
  activeMarketsCount: number;
}

export const StatsTicker: React.FC<StatsTickerProps> = ({
  totalVolume24h,
  totalLiquidity,
  activeMarketsCount,
}) => {
  return (
    <div className="w-full border-b border-neutral-800/60 bg-[#0a0c10]/70 py-2.5 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 overflow-x-auto no-scrollbar text-xs">
        
        {/* Metric 1: 24h Volume */}
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <span className="text-neutral-400 font-medium">Volumen 24h:</span>
          <span className="font-mono font-bold text-neutral-100">${formatCompactNumber(totalVolume24h)} USDC</span>
          <span className="text-[11px] font-mono text-emerald-400 flex items-center">
            <TrendingUp className="w-3 h-3 inline mr-0.5" /> +14.8%
          </span>
        </div>

        <div className="h-3 w-px bg-neutral-800 hidden sm:block" />

        {/* Metric 2: Total Liquidity Pool */}
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="p-1 rounded-md bg-teal-500/10 text-teal-400">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <span className="text-neutral-400 font-medium">Liquidez Total Bloqueada:</span>
          <span className="font-mono font-bold text-neutral-100">${formatCompactNumber(totalLiquidity)} USDC</span>
        </div>

        <div className="h-3 w-px bg-neutral-800 hidden sm:block" />

        {/* Metric 3: Active Markets */}
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-400">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
          <span className="text-neutral-400 font-medium">Mercados Verificados:</span>
          <span className="font-mono font-bold text-neutral-100">{activeMarketsCount} Activos</span>
        </div>

        <div className="h-3 w-px bg-neutral-800 hidden md:block" />

        {/* Metric 4: Gas & Settlement Speed */}
        <div className="hidden md:flex items-center gap-2 whitespace-nowrap">
          <div className="p-1 rounded-md bg-amber-500/10 text-amber-400">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <span className="text-neutral-400 font-medium">Polygon Gas:</span>
          <span className="font-mono text-neutral-200">~$0.05</span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
            Polymarket Live
          </span>
        </div>

      </div>
    </div>
  );
};
