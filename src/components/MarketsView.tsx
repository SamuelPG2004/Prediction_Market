import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import type { Market, MarketCategory } from '../domain/types';
import { useDomainEvents } from '../hooks/useDomainEvents';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useSubcategories } from '../hooks/useSubcategories';
import { useVenueBalances } from '../hooks/useVenueBalances';
import {
  findStarMarket,
  groupEventsForList,
  type MarketEventView,
} from '../utils/eventGrouping';
import { BetSlip } from './BetSlip';
import { EventCard, EventListRow } from './EventCard';
import { FeaturedMatches } from './FeaturedMatches';
import { TradePanel } from './TradePanel';
import { toggleSelection } from '../hooks/useBetSlip';
import { formatCurrency } from '../utils/formatters';
import { subcategoryIcon, subcategoryLabel } from '../utils/subcategories';

/** Tarjetas pintadas por tanda. Renderizar cientos de golpe satura el navegador. */
const PAGE_SIZE = 24;

/**
 * Pestañas: la taxonomía del dominio, con el venue invisible.
 *
 * Solo categorías con oferta real hoy. Tecnología, Cultura y Otros se
 * quitaron a propósito (2026-08-28): ningún venue publica mercados con esos
 * domains y la pestaña vacía confunde más de lo que aporta. Sus mercados,
 * si algún día llegan, siguen saliendo en "Todo"; para reponer una pestaña
 * basta añadir su línea aquí.
 */
const TABS: { label: string; category?: MarketCategory }[] = [
  { label: 'Todo' },
  { label: 'Deportes', category: 'sports' },
  { label: 'Cripto', category: 'crypto' },
  { label: 'Economía', category: 'economy' },
  { label: 'Política', category: 'politics' },
];

interface MarketsViewProps {
  onConnectWallet: () => void;
}

/**
 * Terminal de mercados reales, alimentado por el registry de venues a través
 * del dominio. La vista no sabe cuántas fuentes hay ni cuáles son.
 */
export const MarketsView: React.FC<MarketsViewProps> = ({ onConnectWallet }) => {
  const [tabIndex, setTabIndex] = useState(0);
  const tab = TABS[tabIndex];

  // Subcategoría activa (un deporte dentro de Deportes); undefined = todas.
  const [subcategory, setSubcategory] = useState<string | undefined>(undefined);
  const { subcategories } = useSubcategories(tab.category);

  // Solo eventos en juego ahora mismo. Va en el filtro a los venues: Azuro
  // tiene listado en vivo propio; los venues sin en-vivo aportan cero.
  const [liveOnly, setLiveOnly] = useState(false);

  // Tarjetas o lista compacta (solo Deportes). Preferencia por navegador;
  // localStorage puede no estar (modo privado): en ese caso, tarjetas.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('aether:sportsView') === 'list'
        ? 'list'
        : 'grid';
    } catch {
      return 'grid';
    }
  });
  const changeViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('aether:sportsView', mode);
    } catch {
      // sin persistencia: la preferencia dura lo que dure la pestaña
    }
  };

  const [query, setQuery] = useState('');
  // La búsqueda va al servidor de cada venue; con retardo para no lanzar una
  // petición por tecla.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 350);
    return () => window.clearTimeout(t);
  }, [query]);

  const {
    events,
    isLoading,
    isLoadingMore,
    error,
    degradedVenues,
    hasMore,
    loadMore,
    reload,
    lastSyncAt,
    isSyncing,
  } = useDomainEvents({
    category: tab.category,
    subcategory,
    search: debouncedQuery,
    liveOnly,
  });

  const { balances } = useVenueBalances();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<{
    event: MarketEventView;
    market: Market;
    /** Resultado clicado en la tarjeta, a preseleccionar en el boleto. */
    outcomeId?: string;
  } | null>(null);

  /**
   * Clic en una cuota concreta (hay `outcomeId`): la selección va al boleto,
   * para acumular varias apuestas. Clic en la cabecera o en una fila sin
   * resultado concreto: se abre el panel de detalle del evento.
   */
  const selectMarket = useCallback(
    (event: MarketEventView, market: Market, outcomeId?: string) => {
      if (outcomeId !== undefined) {
        toggleSelection(event.title, market, outcomeId);
        return;
      }
      setSelected({ event, market });
    },
    [],
  );

  // Destacados solo donde aportan: portada y Deportes, sin búsqueda ni filtro
  // de deporte o de en-vivo activos (ahí el usuario ya está buscando otra cosa).
  const showFeatured =
    (tab.category === undefined || tab.category === 'sports') &&
    debouncedQuery.trim() === '' &&
    subcategory === undefined &&
    !liveOnly;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [tabIndex, subcategory, debouncedQuery, liveOnly]);

  // Cambiar de pestaña abandona los filtros de la anterior.
  useEffect(() => {
    setSubcategory(undefined);
    setLiveOnly(false);
  }, [tabIndex]);

  const eventsRef = useRef(events);
  eventsRef.current = events;

  /**
   * Un único centinela cubre las dos paginaciones: primero revela más de lo
   * ya descargado y, cuando se agota, pide la página siguiente a las fuentes.
   */
  const reachEnd = useCallback(() => {
    if (visibleCount < eventsRef.current.length) {
      setVisibleCount((n) => n + PAGE_SIZE);
    } else if (hasMore && !isLoadingMore) {
      loadMore();
    }
  }, [visibleCount, hasMore, isLoadingMore, loadMore]);

  const visible = useMemo(
    () => events.slice(0, visibleCount),
    [events, visibleCount],
  );

  const sentinelRef = useInfiniteScroll({
    onReachEnd: reachEnd,
    enabled: !isLoading && (visibleCount < events.length || hasMore),
  });

  const totalMarkets = useMemo(
    () => events.reduce((a, e) => a + e.markets.length, 0),
    [events],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Cabecera de cuenta */}
      <div className="rounded-2xl bg-[#0d1017] border border-neutral-800/80 overflow-hidden">
        <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Tono sereno a propósito: el rojo se reserva para "en vivo" y
                errores; el aviso de dinero real no es una alarma permanente. */}
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-100 leading-tight">
                Mercados reales
              </h2>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Operar mueve fondos de verdad. Cada apuesta la firmas tú.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {balances.map((b) => (
              <Metric
                key={b.venue}
                label={`Tu ${b.symbol}`}
                value={b.balance === null ? '—' : formatCurrency(b.balance)}
                accent={b.balance !== null}
              />
            ))}
          </div>
        </div>

        {balances.every((b) => b.balance === null) && (
          <button
            onClick={onConnectWallet}
            className="w-full px-5 py-2.5 flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/15 text-[11px] font-semibold text-amber-300 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              Wallet no conectada — explora libremente, o conecta para operar
            </span>
          </button>
        )}
      </div>

      {/* Partidos destacados: lo más apostado, según los venues que rankean */}
      {showFeatured && <FeaturedMatches onSelectMarket={selectMarket} />}

      {/* Pestañas de categoría */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t, i) => {
          const active = i === tabIndex;
          return (
            <button
              key={t.label}
              onClick={() => setTabIndex(i)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                active
                  ? 'bg-neutral-100 text-neutral-900 shadow-lg'
                  : 'bg-[#0f121a] text-neutral-400 border border-neutral-800 hover:text-neutral-200 hover:border-neutral-700'
              }`}
            >
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Chips de subcategoría (deportes dentro de Deportes, etc.) */}
      {subcategories.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 -mt-2">
          {/* En vivo: filtro de estado, pide a los venues su listado en juego. */}
          <button
            onClick={() => setLiveOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 border ${
              liveOnly
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                : 'bg-[#0f121a] text-neutral-500 border-neutral-800/80 hover:text-rose-300 hover:border-rose-500/40'
            }`}
            title="Solo eventos en juego ahora mismo"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span>En vivo</span>
          </button>
          <span className="w-px h-4 bg-neutral-800 shrink-0" />
          <SubcategoryChip
            label="Todos"
            active={subcategory === undefined}
            onClick={() => setSubcategory(undefined)}
          />
          {subcategories.map((s) => (
            <SubcategoryChip
              key={s.id}
              label={subcategoryLabel(s.id, s.label)}
              icon={subcategoryIcon(s.id)}
              count={s.activeCount}
              active={subcategory === s.id}
              onClick={() =>
                setSubcategory((current) => (current === s.id ? undefined : s.id))
              }
            />
          ))}
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
            placeholder={`Buscar en ${tab.label.toLowerCase()}… (mínimo 3 letras)`}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#0f121a] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-sm text-neutral-100 placeholder:text-neutral-600"
          />
        </div>
        {/* Tarjetas / lista compacta: la lista solo aporta en Deportes. */}
        {tab.category === 'sports' && (
          <div className="flex items-center rounded-xl bg-[#0f121a] border border-neutral-800 overflow-hidden shrink-0">
            <button
              onClick={() => changeViewMode('grid')}
              title="Tarjetas"
              className={`p-2.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => changeViewMode('list')}
              title="Lista compacta, agrupada por día y liga"
              className={`p-2.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
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

      {error !== null && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-4 flex items-start gap-2 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No se pudieron cargar los mercados.</p>
            <p className="mt-1 text-rose-300/80">{error}</p>
          </div>
        </div>
      )}

      {degradedVenues.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 flex items-center gap-2 text-[11px] text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            {degradedVenues.join(', ')} no respondió; mostrando el resto de
            fuentes.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* Contador y estado de sincronización */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-mono text-neutral-500">
              <span className="text-neutral-300">{visible.length}</span> de{' '}
              <span className="text-neutral-300">{events.length}</span> eventos ·{' '}
              {totalMarkets} mercados operables
            </p>

            <SyncIndicator isSyncing={isSyncing} lastSyncAt={lastSyncAt} />
          </div>

          {visible.length === 0 && (hasMore || isLoadingMore) ? (
            /* El filtro es en cliente en algunos venues: se sigue barriendo
               el catálogo en segundo plano hasta encontrar algo o agotarlo. */
            <div className="py-20 flex flex-col items-center gap-3 rounded-2xl bg-[#0d1017] border border-dashed border-neutral-800">
              <Loader2 className="w-7 h-7 text-neutral-600 animate-spin" />
              <p className="text-xs text-neutral-500 max-w-xs text-center">
                Buscando en el catálogo…
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-3 rounded-2xl bg-[#0d1017] border border-dashed border-neutral-800">
              <Search className="w-7 h-7 text-neutral-700" />
              <p className="text-sm font-semibold text-neutral-300">
                Sin resultados
              </p>
              <p className="text-xs text-neutral-500 max-w-xs text-center">
                {query
                  ? 'Ninguna fuente devolvió mercados para esa búsqueda.'
                  : liveOnly
                    ? 'No hay eventos en juego ahora mismo.'
                    : 'Esta categoría no tiene mercados operables ahora mismo.'}
              </p>
            </div>
          ) : tab.category === 'sports' && viewMode === 'list' ? (
            /* Lista compacta: filas agrupadas por día y, dentro, por liga. */
            <div className="flex flex-col gap-4">
              {groupEventsForList(visible).map((day) => (
                <section key={day.key} className="flex flex-col gap-2">
                  <h3
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      day.key === 'live' ? 'text-rose-400' : 'text-neutral-300'
                    }`}
                  >
                    {day.label}
                  </h3>
                  {day.leagues.map((lg) => {
                    const sub = lg.events[0]?.markets[0]?.subcategory;
                    const icon = sub !== undefined ? subcategoryIcon(sub) : null;
                    /* Columnas de la pizarra (1 · X · 2), deducidas del
                       mercado estrella del primer evento del grupo. La fila
                       espeja el layout de EventListRow (hora w-11 · título
                       flex-1 · cuotas w-32/w-48 · contador w-10) para que
                       las etiquetas caigan sobre sus columnas. */
                    const sampleStar =
                      lg.events[0] !== undefined
                        ? findStarMarket(lg.events[0].markets)
                        : null;
                    const cols =
                      sampleStar !== null
                        ? Math.min(sampleStar.outcomes.length, 3)
                        : 0;
                    return (
                      <div key={lg.league} className="flex flex-col gap-1">
                        <div className="flex items-center gap-3 px-3">
                          <span className="w-11 shrink-0" />
                          <p className="flex-1 min-w-0 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide text-neutral-500">
                            {icon !== null && <span>{icon}</span>}
                            <span className="truncate">{lg.league}</span>
                            <span className="text-neutral-700">
                              {lg.events.length}
                            </span>
                          </p>
                          {cols >= 2 && (
                            <div
                              className={`shrink-0 grid gap-1.5 text-center text-[9px] font-mono font-bold text-neutral-600 ${
                                cols === 2 ? 'grid-cols-2 w-32' : 'grid-cols-3 w-48'
                              }`}
                            >
                              <span>1</span>
                              {cols === 3 && <span>X</span>}
                              <span>2</span>
                            </div>
                          )}
                          <span className="w-10 shrink-0" />
                        </div>
                        {lg.events.map((e) => (
                          <EventListRow
                            key={e.id}
                            event={e}
                            onSelectMarket={selectMarket}
                          />
                        ))}
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
              {visible.map((e, i) => (
                <EventCard
                  key={e.id}
                  event={e}
                  eagerImage={i < 6}
                  onSelectMarket={selectMarket}
                />
              ))}
            </div>
          )}

          {/* Centinela: dispara la carga al acercarse el final. */}
          <div ref={sentinelRef} className="flex items-center justify-center py-6">
            {visibleCount < events.length || hasMore ? (
              <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{isLoadingMore ? 'Trayendo más mercados…' : 'Cargando más…'}</span>
              </div>
            ) : (
              events.length > 0 && (
                <p className="text-[11px] font-mono text-neutral-700">
                  {events.length} eventos · catálogo completo de {tab.label}
                </p>
              )
            )}
          </div>
        </>
      )}

      {selected !== null && (
        <TradePanel
          event={selected.event}
          market={selected.market}
          initialOutcomeId={selected.outcomeId}
          onClose={() => setSelected(null)}
          onConnectWallet={onConnectWallet}
        />
      )}

      {/* Boleto flotante: solo aparece cuando hay selecciones acumuladas. */}
      <BetSlip onConnectWallet={onConnectWallet} />
    </div>
  );
};

/**
 * Estado del refresco en vivo. Muestra hace cuánto se sincronizó para que un
 * precio viejo no pase por actual si la red falla.
 */
const SyncIndicator: React.FC<{
  isSyncing: boolean;
  lastSyncAt: number | null;
}> = ({ isSyncing, lastSyncAt }) => {
  const [, tick] = useState(0);

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

const SubcategoryChip: React.FC<{
  label: string;
  icon?: string | null;
  count?: number | null;
  active: boolean;
  onClick: () => void;
}> = ({ label, icon, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 border ${
      active
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
        : 'bg-[#0f121a] text-neutral-500 border-neutral-800/80 hover:text-neutral-300 hover:border-neutral-700'
    }`}
  >
    {icon != null && <span className="text-[13px] leading-none">{icon}</span>}
    <span>{label}</span>
    {count != null && (
      <span
        className={`text-[9px] font-mono ${active ? 'text-emerald-400/80' : 'text-neutral-600'}`}
      >
        {count}
      </span>
    )}
  </button>
);

/** Silueta de tarjeta durante la carga: la parrilla no salta al llegar datos. */
const SkeletonCard: React.FC = () => (
  <div className="rounded-2xl bg-[#0d1017] border border-neutral-800/80 p-4 flex flex-col gap-3 animate-pulse">
    <div className="flex items-start gap-3">
      <div className="w-11 h-11 rounded-xl bg-neutral-800/80" />
      <div className="flex-1 flex flex-col gap-2 pt-1">
        <div className="h-3 rounded bg-neutral-800/80 w-4/5" />
        <div className="h-2.5 rounded bg-neutral-800/60 w-2/5" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="h-9 rounded-lg bg-neutral-800/50" />
      <div className="h-9 rounded-lg bg-neutral-800/50" />
    </div>
    <div className="h-2.5 rounded bg-neutral-800/40 w-3/5 mt-1" />
  </div>
);

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
