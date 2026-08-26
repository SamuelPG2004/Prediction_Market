import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { useRealEvents } from '../hooks/useRealEvents';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useOnchainAccount } from '../hooks/useOnchainAccount';
import {
  CATEGORIES,
  SPORTS_SUBCATEGORIES,
  type RealEvent,
  type RealMarket,
} from '../services/gammaApi';
import { EventCard } from './EventCard';
import { RealTradePanel } from './RealTradePanel';
import { formatCurrency } from '../utils/formatters';

/** Tarjetas pintadas por tanda. Renderizar cientos de golpe satura el navegador. */
const PAGE_SIZE = 24;

interface RealMarketsViewProps {
  onConnectWallet: () => void;
}

/**
 * Terminal de eventos reales de Polymarket.
 *
 * Arquitectura centrada en EVENTOS, no en mercados sueltos: es lo que permite
 * mostrar imagen, contexto y varias opciones por tarjeta, igual que la
 * plataforma oficial.
 *
 * El filtro por categoría va contra `/events`. En `/markets` el parámetro
 * `tag_slug` se ignora en silencio y devolvería lo mismo en todas las
 * pestañas (medido).
 */
export const RealMarketsView: React.FC<RealMarketsViewProps> = ({
  onConnectWallet,
}) => {
  const [tabIndex, setTabIndex] = useState(0);
  const tab = CATEGORIES[tabIndex];
  const isSports = tab.label === 'Deportes';

  // Subcategoria activa dentro de Deportes. 0 = "Todos".
  const [subIndex, setSubIndex] = useState(0);
  const effectiveSlug = isSports ? SPORTS_SUBCATEGORIES[subIndex].slug : tab.slug;

  const {
    events,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    reload,
    lastSyncAt,
    isSyncing,
  } = useRealEvents({
    tagSlug: effectiveSlug,
    order: 'order' in tab ? tab.order : 'volume24hr',
  });

  const account = useOnchainAccount();
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<{
    event: RealEvent;
    market: RealMarket;
  } | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [tabIndex, subIndex, query]);

  // Al salir de Deportes se olvida la subcategoria, para no volver filtrado.
  useEffect(() => {
    if (!isSports) setSubIndex(0);
  }, [isSports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.markets.some((m) =>
          (m.optionLabel ?? m.question).toLowerCase().includes(q),
        ),
    );
  }, [events, query]);

  // Se guarda en una ref para que el centinela no dependa del array completo.
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  /**
   * Un unico centinela cubre las dos paginaciones: primero revela mas de lo ya
   * descargado y, cuando se agota, pide la siguiente pagina a la API.
   */
  const reachEnd = useCallback(() => {
    if (visibleCount < filteredRef.current.length) {
      setVisibleCount((n) => n + PAGE_SIZE);
    } else if (hasMore && !isLoadingMore) {
      loadMore();
    }
  }, [visibleCount, hasMore, isLoadingMore, loadMore]);

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const sentinelRef = useInfiniteScroll({
    onReachEnd: reachEnd,
    enabled: !isLoading && (visibleCount < filtered.length || hasMore),
  });

  const totals = useMemo(
    () => ({
      liquidity: events.reduce((a, e) => a + e.liquidityUsd, 0),
      volume24h: events.reduce((a, e) => a + e.volume24hUsd, 0),
      markets: events.reduce((a, e) => a + e.markets.length, 0),
    }),
    [events],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Cabecera de cuenta */}
      <div className="rounded-2xl bg-[#0d1017] border border-neutral-800/80 overflow-hidden">
        <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
            <Metric label="Liquidez" value={formatCurrency(totals.liquidity)} />
            <Metric label="Vol 24h" value={formatCurrency(totals.volume24h)} />
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
            <span>Wallet no conectada — explora libremente, o conecta para operar</span>
          </button>
        )}
      </div>

      {/* Pestañas de categoría */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {CATEGORIES.map((c, i) => {
          const active = i === tabIndex;
          const isTrending = c.label === 'Tendencia';
          const isNew = c.label === 'Nuevo';
          return (
            <button
              key={c.label}
              onClick={() => setTabIndex(i)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                active
                  ? 'bg-neutral-100 text-neutral-900 shadow-lg'
                  : 'bg-[#0f121a] text-neutral-400 border border-neutral-800 hover:text-neutral-200 hover:border-neutral-700'
              }`}
            >
              {isTrending && (
                <TrendingUp
                  className={`w-3.5 h-3.5 ${active ? 'text-neutral-900' : 'text-emerald-400'}`}
                />
              )}
              {isNew && (
                <Sparkles
                  className={`w-3.5 h-3.5 ${active ? 'text-neutral-900' : 'text-amber-400'}`}
                />
              )}
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subcategorías de Deportes */}
      {isSports && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 -mt-2">
          {SPORTS_SUBCATEGORIES.map((sc, i) => {
            const active = i === subIndex;
            return (
              <button
                key={sc.slug}
                onClick={() => setSubIndex(i)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 ${
                  active
                    ? 'bg-emerald-500 text-black'
                    : 'bg-[#0d1017] text-neutral-500 border border-neutral-800 hover:text-neutral-300'
                }`}
              >
                {sc.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Búsqueda */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar en ${tab.label}...`}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#0f121a] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-sm text-neutral-100 placeholder:text-neutral-600"
          />
        </div>
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
            <p className="font-semibold">No se pudieron cargar los eventos.</p>
            <p className="mt-1 text-rose-300/80">{error}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-24 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
          <p className="text-xs text-neutral-500 font-mono">
            Cargando {tab.label.toLowerCase()}...
          </p>
        </div>
      ) : (
        <>
          {/* Contador y estado de sincronización */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-mono text-neutral-500">
              <span className="text-neutral-300">{visible.length}</span> de{' '}
              <span className="text-neutral-300">{filtered.length}</span>{' '}
              eventos · {totals.markets} mercados operables
            </p>

            <SyncIndicator isSyncing={isSyncing} lastSyncAt={lastSyncAt} />
          </div>

          {visible.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-3 rounded-2xl bg-[#0d1017] border border-dashed border-neutral-800">
              <Search className="w-7 h-7 text-neutral-700" />
              <p className="text-sm font-semibold text-neutral-300">
                Sin resultados
              </p>
              <p className="text-xs text-neutral-500 max-w-xs text-center">
                {query
                  ? 'Ningún evento cargado coincide con la búsqueda.'
                  : 'Esta categoría no devolvió eventos operables.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
              {visible.map((e, i) => (
                <EventCard
                  key={e.id}
                  event={e}
                  eagerImage={i < 6}
                  onSelectMarket={(event, market) =>
                    setSelected({ event, market })
                  }
                />
              ))}
            </div>
          )}

          {/* Centinela: dispara la carga al acercarse el final. Sustituye a los
              botones de "cargar más": el flujo no depende de pulsar nada. */}
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-6"
          >
            {visibleCount < filtered.length || hasMore ? (
              <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {isLoadingMore
                    ? 'Trayendo más de Polymarket...'
                    : 'Cargando más...'}
                </span>
              </div>
            ) : (
              events.length > 0 && (
                <p className="text-[11px] font-mono text-neutral-700">
                  {events.length} eventos · catálogo completo de{' '}
                  {isSports ? SPORTS_SUBCATEGORIES[subIndex].label : tab.label}
                </p>
              )
            )}
          </div>
        </>
      )}

      {selected && (
        <RealTradePanel
          event={selected.event}
          market={selected.market}
          onClose={() => setSelected(null)}
          onConnectWallet={onConnectWallet}
        />
      )}
    </div>
  );
};

/**
 * Estado del refresco en vivo.
 *
 * Muestra hace cuánto se sincronizó para que un precio viejo no pase por
 * actual si la red falla.
 */
const SyncIndicator: React.FC<{
  isSyncing: boolean;
  lastSyncAt: number | null;
}> = ({ isSyncing, lastSyncAt }) => {
  const [, tick] = useState(0);

  // Refresca el texto "hace Ns" sin depender de que llegue otro dato.
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, []);

  const seconds =
    lastSyncAt === null ? null : Math.floor((Date.now() - lastSyncAt) / 1000);
  const stale = seconds !== null && seconds > 90;

  return (
    <span
      className={`flex items-center gap-1.5 text-[10px] font-mono ${
        stale ? 'text-amber-400' : 'text-neutral-600'
      }`}
      title="Los precios se refrescan automáticamente"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isSyncing
            ? 'bg-emerald-400 animate-pulse'
            : stale
              ? 'bg-amber-400'
              : 'bg-emerald-500/60'
        }`}
      />
      <span>
        {seconds === null
          ? 'sincronizando'
          : seconds < 10
            ? 'en vivo'
            : `hace ${seconds}s`}
      </span>
    </span>
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
