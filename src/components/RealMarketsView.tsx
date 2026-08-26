import React, { useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  AlertTriangle,
  Activity,
  Droplets,
  ExternalLink,
} from 'lucide-react';
import { useRealMarkets } from '../hooks/useRealMarkets';
import { useOnchainAccount } from '../hooks/useOnchainAccount';
import type { RealMarket } from '../services/gammaApi';
import { RealTradePanel } from './RealTradePanel';
import { formatCompactNumber, formatCurrency } from '../utils/formatters';

/**
 * Mercados reales de Polymarket con liquidez real, leídos de la Gamma API.
 *
 * Esta vista funciona sin wallet conectada: se puede mirar el mercado antes de
 * decidir conectar. La wallet solo hace falta para operar.
 */
interface RealMarketsViewProps {
  /** Abre el modal de conexion de wallet. */
  onConnectWallet: () => void;
}

export const RealMarketsView: React.FC<RealMarketsViewProps> = ({
  onConnectWallet,
}) => {
  const { markets, isLoading, error, reload } = useRealMarkets(50);
  const account = useOnchainAccount();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RealMarket | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter(
      (m) =>
        m.question.toLowerCase().includes(q) ||
        m.eventTitle?.toLowerCase().includes(q),
    );
  }, [markets, query]);

  return (
    <div className="flex flex-col gap-5">
      {/* Aviso de dinero real */}
      <div className="rounded-2xl bg-gradient-to-r from-rose-500/10 via-[#0f131c] to-[#121622] border border-rose-500/25 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-neutral-100">
              Modo real · Polygon Mainnet
            </h2>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Estos son mercados reales de Polymarket con liquidez real. Operar
              aquí mueve <span className="text-rose-300 font-semibold">USDC
              de verdad</span> desde tu wallet. Las órdenes las firmas tú; nadie
              puede mover tus fondos sin tu firma.
            </p>
            {account.isConnected && (
              <p className="text-[11px] font-mono text-neutral-400 mt-2">
                Tu USDC en Polygon:{' '}
                <span className="text-neutral-100 font-bold">
                  {account.isLoading
                    ? '...'
                    : formatCurrency(account.usdcBalance)}
                </span>
              </p>
            )}
            {!account.isConnected && (
              <p className="text-[11px] text-amber-300 mt-2">
                Wallet no conectada: puedes mirar, pero no operar.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar entre los mercados reales..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0f121a] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-sm text-neutral-100 placeholder:text-neutral-600"
          />
        </div>
        <button
          onClick={reload}
          disabled={isLoading}
          className="p-2.5 rounded-xl bg-[#0f121a] border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200 transition-all disabled:opacity-50"
          title="Recargar"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Estado */}
      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-4 flex items-start gap-2 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No se pudieron cargar los mercados.</p>
            <p className="mt-1 text-rose-300/80">{error}</p>
          </div>
        </div>
      )}

      {isLoading && markets.length === 0 ? (
        <div className="py-20 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-xs text-neutral-500 font-mono">
            Leyendo mercados de Polymarket...
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono font-bold uppercase text-neutral-400 tracking-wider flex items-center gap-2">
              <span>Mercados reales</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                {filtered.length}
              </span>
            </h3>
            <span className="text-[11px] font-mono text-neutral-500">
              ordenados por volumen 24h
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => (
              <RealMarketCard
                key={m.id}
                market={m}
                onClick={() => setSelected(m)}
              />
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="text-center text-xs text-neutral-500 py-10">
              Ningún mercado coincide con la búsqueda.
            </p>
          )}
        </>
      )}

      {selected && (
        <RealTradePanel
          market={selected}
          onClose={() => setSelected(null)}
          onConnectWallet={onConnectWallet}
        />
      )}
    </div>
  );
};

const RealMarketCard: React.FC<{
  market: RealMarket;
  onClick: () => void;
}> = ({ market, onClick }) => {
  const yesPrice = market.prices[0] ?? 0.5;
  const yesPct = Math.round(yesPrice * 100);

  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl bg-gradient-to-b from-[#141722]/90 to-[#0e1017]/95 border border-neutral-800/80 hover:border-emerald-500/40 transition-all p-4 flex flex-col gap-3 shadow-lg hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {market.eventTitle && (
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-800/80 text-neutral-400 border border-neutral-700/50 line-clamp-1 max-w-[150px]">
              {market.eventTitle}
            </span>
          )}
          {market.negRisk && (
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300">
              negRisk
            </span>
          )}
        </div>
        {!market.acceptingOrders && (
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 shrink-0">
            cerrado
          </span>
        )}
      </div>

      <h4 className="text-sm font-bold text-neutral-100 leading-snug line-clamp-3">
        {market.question}
      </h4>

      {/* Precios por resultado */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-mono font-extrabold text-emerald-400">
            {yesPct}%
          </span>
          <span className="text-[11px] font-mono text-neutral-400 line-clamp-1 max-w-[55%] text-right">
            {market.outcomes.slice(0, 2).join(' / ')}
          </span>
        </div>
        <div className="relative w-full h-1.5 rounded-full bg-neutral-900 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
            style={{ width: `${Math.min(Math.max(yesPct, 0), 100)}%` }}
          />
        </div>
      </div>

      {/* Métricas reales */}
      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 border-t border-neutral-800/50 pt-2.5">
        <span className="flex items-center gap-1" title="Liquidez real del libro">
          <Droplets className="w-3 h-3 text-neutral-500" />${' '}
          {formatCompactNumber(market.liquidityUsd)}
        </span>
        <span className="flex items-center gap-1" title="Volumen 24h">
          <Activity className="w-3 h-3 text-neutral-500" />${' '}
          {formatCompactNumber(market.volume24hUsd)}
        </span>
        <span className="flex items-center gap-1 text-emerald-400">
          <ExternalLink className="w-3 h-3" />
          operar
        </span>
      </div>
    </button>
  );
};
