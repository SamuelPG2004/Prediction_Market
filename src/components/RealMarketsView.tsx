import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  AlertTriangle,
  Activity,
  Droplets,
  ChevronDown,
  ListPlus,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useRealMarkets } from '../hooks/useRealMarkets';
import { useOnchainAccount } from '../hooks/useOnchainAccount';
import {
  CATEGORIES,
  type CategorySlug,
  type RealMarket,
} from '../services/gammaApi';
import { RealTradePanel } from './RealTradePanel';
import { formatCompactNumber, formatCurrency } from '../utils/formatters';

/** Cuántas tarjetas se pintan de golpe. Renderizar miles satura el navegador. */
const PAGE_SIZE = 48;

interface RealMarketsViewProps {
  /** Abre el modal de conexion de wallet. */
  onConnectWallet: () => void;
}

/**
 * Terminal de mercados reales de Polymarket.
 *
 * Navegación por categorías al estilo de la plataforma original. Ojo con la
 * fuente de datos: el filtro por categoría va contra `/events`, porque en
 * `/markets` el parámetro `tag_slug` se ignora en silencio (ver gammaApi.ts).
 */
export const RealMarketsView: React.FC<RealMarketsViewProps> = ({
  onConnectWallet,
}) => {
  const [category, setCategory] = useState<CategorySlug>(null);
  const {
    markets,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    loadAll,
    reload,
    sort,
    setSort,
  } = useRealMarkets(category);

  const account = useOnchainAccount();
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<RealMarket | null>(null);

  // Al cambiar de pestaña o buscar, volver al principio del listado.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter(
      (m) =>
        m.question.toLowerCase().includes(q) ||
        (m.eventTitle?.toLowerCase().includes(q) ?? false),
    );
  }, [markets, query]);

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const totals = useMemo(
    () => ({
      liquidity: markets.reduce((a, m) => a + m.liquidityUsd, 0),
      volume24h: markets.reduce((a, m) => a + m.volume24hUsd, 0),
    }),
    [markets],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera: estado de la cuenta y aviso de dinero real */}
      <div className="rounded-2xl bg-[#0d1017] border border-neutral-800/80 overflow-hidden">
        <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-100 leading-tight">
                Mercados reales · Polygon
              </h2>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Operar mueve USDC de verdad. Cada orden la firmas tú.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <Metric
              label="Liquidez cargada"
              value={formatCurrency(totals.liquidity)}
            />
            <Metric
              label="Vol 24h"
              value={formatCurrency(totals.volume24h)}
            />
            <Metric
              label="Tu USDC"
              value={
                !account.isConnected
                  ? '—'
                  : account.isLoading
                    ? '...'
                    : formatCurrency(account.usdcBalance)
              }
              accent={account.isConnected}
            />
          </div>
        </div>

        {!account.isConnected && (
          <button
            onClick={onConnectWallet}
            className="w-full px-5 py-2.5 flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/15 text-[11px] font-semibold text-amber-300 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              Wallet no conectada — puedes explorar, pero no operar. Conectar
            </span>
          </button>
        )}
      </div>

      {/* Pestañas de categoría */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {CATEGORIES.map((c) => {
          const active = category === c.slug;
          return (
            <button
              key={c.slug ?? 'trending'}
              onClick={() => setCategory(c.slug)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                active
                  ? 'bg-neutral-100 text-neutral-900 shadow-lg'
                  : 'bg-[#0f121a] text-neutral-400 border border-neutral-800 hover:text-neutral-200 hover:border-neutral-700'
              }`}
            >
              {c.slug === null && (
                <TrendingUp
                  className={`w-3.5 h-3.5 ${active ? 'text-neutral-900' : 'text-emerald-400'}`}
                />
              )}
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* Barra de búsqueda y orden */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en esta categoría..."
            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#0f121a] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-sm text-neutral-100 placeholder:text-neutral-600"
          />
        </div>

        {/* El orden solo aplica a Tendencia: en las categorías manda /events. */}
        {category === null && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="px-3 py-2.5 rounded-xl bg-[#0f121a] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-xs text-neutral-300"
          >
            <option value="liquidityNum">Mayor liquidez</option>
            <option value="volume24hr">Mayor volumen 24h</option>
            <option value="volumeNum">Mayor volumen total</option>
          </select>
        )}

        <button
          onClick={reload}
          disabled={isLoading}
          className="p-2.5 rounded-xl bg-[#0f121a] border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200 transition-all disabled:opacity-50 shrink-0"
          title="Recargar"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-4 flex items-start gap-2 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No se pudieron cargar los mercados.</p>
            <p className="mt-1 text-rose-300/80">{error}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-24 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
          <p className="text-xs text-neutral-500 font-mono">
            Cargando mercados de Polymarket...
          </p>
        </div>
      ) : (
        <>
          {/* Contador discreto */}
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-mono text-neutral-500">
              mostrando{' '}
              <span className="text-neutral-300">{visible.length}</span> de{' '}
              <span className="text-neutral-300">{filtered.length}</span>
              {query && ` · filtrado de ${markets.length}`}
            </p>
            {hasMore && (
              <p className="text-[11px] font-mono text-amber-400/80">
                quedan más por traer
              </p>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-3 rounded-2xl bg-[#0d1017] border border-dashed border-neutral-800">
              <Search className="w-7 h-7 text-neutral-700" />
              <p className="text-sm font-semibold text-neutral-300">
                Sin resultados
              </p>
              <p className="text-xs text-neutral-500 max-w-xs text-center">
                {query
                  ? 'Ningún mercado cargado coincide. Prueba otra categoría o trae más.'
                  : 'Esta categoría no devolvió mercados operables.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((m) => (
                <RealMarketCard
                  key={m.id}
                  market={m}
                  onClick={() => setSelected(m)}
                />
              ))}
            </div>
          )}

          {/* Paginación: primero la de pintado, luego la de red */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 py-2">
            {visibleCount < filtered.length && (
              <button
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-100 hover:bg-white text-neutral-900 text-xs font-bold transition-all active:scale-95"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Mostrar {PAGE_SIZE} más</span>
              </button>
            )}

            {hasMore && (
              <>
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0f121a] hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/40 text-xs font-bold text-neutral-200 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ListPlus className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>Traer más de Polymarket</span>
                </button>

                <button
                  onClick={loadAll}
                  disabled={isLoadingMore}
                  className="px-5 py-2.5 rounded-xl bg-transparent hover:bg-[#0f121a] border border-neutral-800/60 text-xs font-semibold text-neutral-500 hover:text-neutral-300 transition-all active:scale-95 disabled:opacity-50"
                  title="Recorre todas las páginas restantes"
                >
                  Traer todo
                </button>
              </>
            )}

            {!hasMore && visibleCount >= filtered.length && markets.length > 0 && (
              <p className="text-[11px] font-mono text-neutral-600">
                {markets.length} mercados · catálogo completo de esta categoría
              </p>
            )}
          </div>
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

const Metric: React.FC<{
  label: string;
  value: string;
  accent?: boolean;
}> = ({ label, value, accent }) => (
  <div className="flex flex-col">
    <span className="text-[9px] uppercase font-mono text-neutral-600 tracking-wider">
      {label}
    </span>
    <span
      className={`text-sm font-mono font-bold ${accent ? 'text-emerald-400' : 'text-neutral-200'}`}
    >
      {value}
    </span>
  </div>
);

const RealMarketCard: React.FC<{
  market: RealMarket;
  onClick: () => void;
}> = ({ market, onClick }) => {
  const yesPrice = market.prices[0] ?? 0.5;
  const yesPct = Math.round(yesPrice * 100);
  const noPct = 100 - yesPct;

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-2xl bg-[#0d1017] border border-neutral-800/80 hover:border-neutral-700 hover:bg-[#101420] transition-all p-4 flex flex-col gap-3.5"
    >
      {/* Contexto: evento y etiquetas */}
      <div className="flex items-start justify-between gap-2 min-h-[18px]">
        {market.eventTitle ? (
          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 line-clamp-1">
            {market.eventTitle}
          </span>
        ) : (
          <span />
        )}
        {market.negRisk && (
          <span
            className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400/90 shrink-0"
            title="Mercado de riesgo negativo: usa otro exchange y otra aprobación"
          >
            negRisk
          </span>
        )}
      </div>

      {/* Pregunta */}
      <h4 className="text-[13px] font-semibold text-neutral-100 leading-snug line-clamp-2 min-h-[36px] group-hover:text-white">
        {market.question}
      </h4>

      {/* Probabilidad */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-mono font-extrabold text-emerald-400 leading-none">
              {yesPct}
              <span className="text-xs font-bold">%</span>
            </span>
            <span className="text-[10px] font-mono uppercase text-neutral-500">
              {market.outcomes[0] ?? 'Sí'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-neutral-600">
            {noPct}% {market.outcomes[1] ?? 'No'}
          </span>
        </div>

        <div className="relative w-full h-1 rounded-full bg-neutral-900 overflow-hidden">
          <div
            className="h-full bg-emerald-500/80 transition-all"
            style={{ width: `${Math.min(Math.max(yesPct, 0), 100)}%` }}
          />
        </div>
      </div>

      {/* Métricas reales */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-neutral-500 border-t border-neutral-800/60 pt-2.5">
        <span
          className="flex items-center gap-1"
          title="Liquidez real del libro"
        >
          <Droplets className="w-3 h-3" />${formatCompactNumber(market.liquidityUsd)}
        </span>
        <span className="flex items-center gap-1" title="Volumen 24h">
          <Activity className="w-3 h-3" />$
          {formatCompactNumber(market.volume24hUsd)}
        </span>
        <span className="ml-auto text-emerald-400/0 group-hover:text-emerald-400 transition-colors font-semibold">
          operar →
        </span>
      </div>
    </button>
  );
};
