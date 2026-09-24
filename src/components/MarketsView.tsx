import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  Trophy,
  X,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import type { League, Market, MarketCategory } from '../domain/types';
import { useDomainEvents } from '../hooks/useDomainEvents';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useLeagues } from '../hooks/useLeagues';
import { useSubcategories } from '../hooks/useSubcategories';
import { useVenueBalances } from '../hooks/useVenueBalances';
import {
  findStarMarket,
  groupEventsForList,
  type MarketEventView,
} from '../utils/eventGrouping';
import { buildSearchIndex, querySearchIndex } from '../utils/searchIndex';
import { BetSlip } from './BetSlip';
import { EventCard, EventListRow, orderedStarOutcomes } from './EventCard';
import { CountryFlag, LeagueBrowser } from './LeagueBrowser';
import { FEATURED_COUNT, FeaturedMatches } from './FeaturedMatches';
import { LIVE_COUNT, LiveMatches } from './LiveMatches';
import { useFeaturedEvents } from '../hooks/useFeaturedEvents';
import { useLiveEvents } from '../hooks/useLiveEvents';
import { useLiveScores } from '../hooks/useLiveScores';
import { LowGasBanner } from './LowGasBanner';
import { TipsterPicks } from './TipsterPicks';
import { TradePanel } from './TradePanel';
import { SportsHero } from './SportsHero';
import { toggleSelection } from '../hooks/useBetSlip';
import { countryDisplay } from '../utils/countries';
import { formatCurrency } from '../utils/formatters';
import { subcategoryIcon, subcategoryLabel } from '../utils/subcategories';
import { translateOutcomeLabel } from '../utils/marketLabels';

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
  /** Abre el bridge preseleccionado en el gas nativo de esa red. */
  onGetGas: (chainId: number) => void;
}

/**
 * Terminal de mercados reales, alimentado por el registry de venues a través
 * del dominio. La vista no sabe cuántas fuentes hay ni cuáles son.
 */
export const MarketsView: React.FC<MarketsViewProps> = ({
  onConnectWallet,
  onGetGas,
}) => {
  const [tabIndex, setTabIndex] = useState(0);
  const tab = TABS[tabIndex];

  // Subcategoría activa (un deporte dentro de Deportes); undefined = todas.
  const [subcategory, setSubcategory] = useState<string | undefined>(undefined);
  const { subcategories } = useSubcategories(tab.category);

  // Liga concreta dentro del deporte elegido (va al filtro de los venues, con
  // país porque los ids de liga se repiten entre países). null = todas.
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  // Catálogo completo del deporte: la fila "Todos los partidos" del navegador
  // de ligas. Sin ella, elegir deporte aterriza en el navegador por países.
  const [browseAll, setBrowseAll] = useState(false);
  const { leagues, isLoading: leaguesLoading } = useLeagues(
    tab.category,
    subcategory,
  );
  useEffect(() => {
    setSelectedLeague(null);
    setBrowseAll(false);
  }, [subcategory]);

  // Solo eventos en juego ahora mismo. Va en el filtro a los venues: Azuro
  // tiene listado en vivo propio; los venues sin en-vivo aportan cero.
  const [liveOnly, setLiveOnly] = useState(false);

  // Tarjetas o lista compacta (solo Deportes). Preferencia por navegador;
  // localStorage puede no estar (modo privado): en ese caso, tarjetas.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('aether:sportsView') === 'grid'
        ? 'grid'
        : 'list';
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

  // Panel de sugerencias instantáneas bajo el buscador. Abierto mientras el
  // input tiene el foco; elegir una sugerencia lo cierra sin soltar el foco.
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // Filtro de liga elegido en una sugerencia. Es un recorte en cliente sobre
  // lo descargado: la liga no es dimensión de filtro del puerto MarketSource.
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);

  const {
    events,
    isLoading,
    isLoadingMore,
    loadMoreError,
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
    league:
      selectedLeague !== null
        ? { id: selectedLeague.id, country: selectedLeague.country }
        : undefined,
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

  // Corpus de sugerencias: el último catálogo SIN búsqueda activa. En cuanto
  // el retardo dispara la búsqueda de servidor, `events` pasa a ser sus
  // resultados (o se vacía si un venue falla); congelar el corpus evita que
  // las sugerencias desaparezcan justo mientras se escribe.
  const [indexEvents, setIndexEvents] = useState<MarketEventView[]>([]);
  useEffect(() => {
    if (debouncedQuery.trim() === '') setIndexEvents(events);
  }, [events, debouncedQuery]);

  // Los destacados también siembran el índice: son lo más apostado (Madrid,
  // City…), justo lo que se teclea primero, y llegan antes que el catálogo.
  const { events: featuredEvents, isLoading: isFeaturedLoading } =
    useFeaturedEvents(FEATURED_COUNT);

  // Partidos en juego ahora mismo, para la sección "En vivo".
  const { events: liveEvents, isLoading: isLiveLoading } =
    useLiveEvents(LIVE_COUNT);

  // Sus marcadores, en push por el socket del venue (solo los visibles).
  const liveScores = useLiveScores(liveEvents);
  const sportsFeatureEvent = liveEvents[0] ?? featuredEvents[0] ?? null;

  /**
   * "Ver todos" de la sección En vivo: salta a Deportes con el filtro en vivo
   * puesto. El efecto de cambio de pestaña resetea los filtros; esta bandera
   * le pide que respete el que acabamos de encender.
   */
  const keepLiveRef = useRef(false);
  const viewAllLive = useCallback(() => {
    const sportsIndex = TABS.findIndex((t) => t.category === 'sports');
    setTabIndex((current) => {
      if (current !== sportsIndex) keepLiveRef.current = true;
      return sportsIndex;
    });
    setLiveOnly(true);
  }, []);

  // Índice normalizado (equipos, ligas, títulos) sobre ese corpus: las
  // sugerencias salen de aquí al instante, sin esperar al servidor.
  const searchIndex = useMemo(() => {
    const byId = new Map<string, MarketEventView>();
    for (const event of [...indexEvents, ...featuredEvents]) {
      if (!byId.has(event.id)) byId.set(event.id, event);
    }
    return buildSearchIndex([...byId.values()]);
  }, [indexEvents, featuredEvents]);
  const suggestions = useMemo(
    () => querySearchIndex(searchIndex, query),
    [searchIndex, query],
  );
  const hasSuggestions =
    suggestions.leagues.length > 0 || suggestions.events.length > 0;

  /** Sugerencia de liga: aplica el recorte y despeja el texto de búsqueda. */
  const applyLeagueFilter = useCallback((league: string) => {
    setLeagueFilter(league);
    setQuery('');
    setDebouncedQuery('');
    setSuggestionsOpen(false);
  }, []);

  /**
   * Sugerencia de partido/equipo: directo al detalle del evento, en su mercado
   * estrella si cotiza (mismo criterio que la cabecera de la tarjeta).
   */
  const openSuggestedEvent = useCallback((event: MarketEventView) => {
    const star = findStarMarket(event.markets);
    const target =
      (star !== null && star.isQuotable ? star : undefined) ??
      event.markets.find((m) => m.isQuotable) ??
      event.markets[0];
    if (target !== undefined) setSelected({ event, market: target });
    setSuggestionsOpen(false);
  }, []);

  // El recorte de liga se aplica en cliente sobre los eventos descargados.
  const filteredEvents = useMemo(
    () =>
      leagueFilter === null
        ? events
        : events.filter((e) => e.leagueName === leagueFilter),
    [events, leagueFilter],
  );

  // La portada conserva sus carruseles. Deportes usa una sola tarjeta principal
  // y solo cuando el usuario está en el landing sin filtros activos.
  const showFeatured =
    tab.category === undefined &&
    debouncedQuery.trim() === '' &&
    subcategory === undefined &&
    leagueFilter === null &&
    !liveOnly;
  const showSportsLanding =
    tab.category === 'sports' &&
    debouncedQuery.trim() === '' &&
    subcategory === undefined &&
    leagueFilter === null &&
    selectedLeague === null &&
    !browseAll &&
    !liveOnly;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [tabIndex, subcategory, debouncedQuery, liveOnly, leagueFilter, selectedLeague]);

  // Cambiar de pestaña abandona los filtros de la anterior (salvo el en-vivo
  // recién puesto por el "Ver todos" de la sección En vivo).
  useEffect(() => {
    setSubcategory(undefined);
    setLeagueFilter(null);
    setBrowseAll(false);
    if (keepLiveRef.current) keepLiveRef.current = false;
    else setLiveOnly(false);
  }, [tabIndex]);

  /**
   * El navegador de ligas por país es la vista de aterrizaje de un deporte:
   * se pinta solo con los recuentos de la navegación (sin bajar partidos) y
   * cede el sitio al listado en cuanto hay liga elegida, catálogo completo,
   * en vivo o búsqueda.
   */
  const sportInfo = subcategories.find((s) => s.id === subcategory);
  const showLeagueBrowser =
    tab.category === 'sports' &&
    subcategory !== undefined &&
    leagues.length > 0 &&
    selectedLeague === null &&
    !browseAll &&
    !liveOnly &&
    leagueFilter === null &&
    debouncedQuery.trim() === '';

  // Con una liga elegida se trae SU calendario completo (pocas páginas): el
  // usuario espera ver todos los partidos de la competición, no ir haciendo
  // scroll para pedirlos. El tope corta si un cursor no avanzara.
  const leagueAutoLoads = useRef(0);
  useEffect(() => {
    leagueAutoLoads.current = 0;
  }, [selectedLeague]);
  useEffect(() => {
    if (selectedLeague === null || isLoading || isLoadingMore || !hasMore) return;
    if (leagueAutoLoads.current >= 40) return;
    leagueAutoLoads.current += 1;
    loadMore();
  }, [selectedLeague, isLoading, isLoadingMore, hasMore, loadMore]);

  const eventsRef = useRef(filteredEvents);
  eventsRef.current = filteredEvents;

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

  /**
   * En deportes manda la inminencia: en juego primero y el resto por hora de
   * comienzo (sin hora, al final). Se ordena ANTES de recortar la página para
   * que el scroll infinito no intercale partidos anteriores más abajo. En las
   * demás categorías se respeta el orden de las fuentes (popularidad).
   */
  const visible = useMemo(() => {
    const ordered =
      tab.category === 'sports'
        ? [...filteredEvents].sort((a, b) => {
            if ((a.isLive === true) !== (b.isLive === true)) {
              return a.isLive === true ? -1 : 1;
            }
            const ta =
              a.markets[0]?.closesAt?.getTime() ?? Number.POSITIVE_INFINITY;
            const tb =
              b.markets[0]?.closesAt?.getTime() ?? Number.POSITIVE_INFINITY;
            return ta - tb;
          })
        : filteredEvents;
    return ordered.slice(0, visibleCount);
  }, [filteredEvents, visibleCount, tab.category]);

  const sentinelRef = useInfiniteScroll({
    onReachEnd: reachEnd,
    enabled:
      !isLoading &&
      loadMoreError === null &&
      (visibleCount < filteredEvents.length || hasMore),
  });

  const totalMarkets = useMemo(
    () => filteredEvents.reduce((a, e) => a + e.markets.length, 0),
    [filteredEvents],
  );

  const clearDiscoveryFilters = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setLeagueFilter(null);
    setSelectedLeague(null);
    setBrowseAll(false);
    setLiveOnly(false);
    setSubcategory(undefined);
  }, []);

  const hasDiscoveryFilters =
    query.trim() !== '' ||
    leagueFilter !== null ||
    selectedLeague !== null ||
    browseAll ||
    liveOnly ||
    subcategory !== undefined;

  return (
    <div className={`flex flex-col ${tab.category === 'sports' ? 'gap-4' : 'gap-5'}`}>
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

      {/* Gas nativo bajo: aviso accionable antes de que una operación falle */}
      <LowGasBanner onGetGas={onGetGas} />

      {/* La portada mantiene sus bloques destacados. En Deportes se sustituyen
          los carruseles por un único partido principal debajo de sus filtros. */}
      {showFeatured && (
        <LiveMatches
          events={liveEvents}
          isLoading={isLiveLoading}
          scores={liveScores}
          onSelectMarket={selectMarket}
          onViewAll={viewAllLive}
        />
      )}
      {showFeatured && (
        <FeaturedMatches
          events={featuredEvents}
          isLoading={isFeaturedLoading}
          onSelectMarket={selectMarket}
        />
      )}
      {showFeatured && (
        <TipsterPicks
          candidateEvents={featuredEvents}
          onOpenMarket={(event, market, outcomeId) =>
            setSelected({ event, market, outcomeId })
          }
        />
      )}

      {/* Pestañas de categoría */}
      <div
        role="tablist"
        aria-label="Categorías de mercados"
        className="flex items-center gap-5 overflow-x-auto border-b border-neutral-800/80 -mx-1 px-1"
      >
        {TABS.map((t, i) => {
          const active = i === tabIndex;
          return (
            <button
              key={t.label}
              role="tab"
              aria-selected={active}
              onClick={() => setTabIndex(i)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-1 py-3 text-[11px] font-extrabold uppercase tracking-[0.1em] whitespace-nowrap transition-colors ${
                active
                  ? 'border-emerald-400 text-neutral-100'
                  : 'border-transparent text-neutral-500 hover:text-neutral-200'
              }`}
            >
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Chips de subcategoría (deportes dentro de Deportes, etc.) */}
      {subcategories.length > 0 && (
        <div className="-mt-2 flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-neutral-800/80 bg-[#0c1017] p-2">
          {/* En vivo: filtro de estado, pide a los venues su listado en juego. */}
          <button
            onClick={() => setLiveOnly((v) => !v)}
            aria-pressed={liveOnly}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold whitespace-nowrap transition-all ${
              liveOnly
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                : 'border-neutral-800 bg-[#10151c] text-neutral-400 hover:border-rose-500/40 hover:text-rose-300'
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
              countTitle="Partidos prematch activos reportados por la fuente"
              active={subcategory === s.id}
              onClick={() =>
                setSubcategory((current) => (current === s.id ? undefined : s.id))
              }
            />
          ))}
        </div>
      )}

      {showSportsLanding && (
        <SportsHero
          event={sportsFeatureEvent}
          isLoading={sportsFeatureEvent === null && (isLiveLoading || isFeaturedLoading)}
          liveScore={
            sportsFeatureEvent?.isLive
              ? liveScores.get(sportsFeatureEvent.id)
              : undefined
          }
          onSelectMarket={selectMarket}
          onViewAll={viewAllLive}
        />
      )}

      {/* Miga del navegador de ligas: vuelta a países y qué se está viendo. */}
      {tab.category === 'sports' &&
        subcategory !== undefined &&
        (selectedLeague !== null || browseAll) && (
          <div className="flex items-center gap-2 -mt-2 flex-wrap">
            <button
              onClick={() => {
                setSelectedLeague(null);
                setBrowseAll(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#0f121a] text-neutral-400 border border-neutral-800/80 hover:text-neutral-200 hover:border-neutral-700 transition-colors"
            >
              ← Países y ligas
            </button>
            {selectedLeague !== null ? (
              <button
                onClick={() => setSelectedLeague(null)}
                title="Quitar el filtro de liga"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/40 hover:bg-amber-500/15 transition-colors"
              >
                <CountryFlag display={countryDisplay(selectedLeague.country)} />
                <span>
                  {countryDisplay(selectedLeague.country).label} ·{' '}
                  {selectedLeague.label}
                </span>
                <X className="w-3 h-3" />
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                Todos los partidos
              </span>
            )}
          </div>
        )}

      {/* Búsqueda */}
      <div className="flex items-center gap-2" role="search">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <label htmlFor="market-search" className="sr-only">
            Buscar mercados, equipos o ligas
          </label>
          <input
            id="market-search"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggestionsOpen(true);
            }}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => setSuggestionsOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSuggestionsOpen(false);
            }}
            placeholder={`Buscar en ${tab.label.toLowerCase()}… (mínimo 3 letras)`}
            className={`w-full pl-10 ${query !== '' ? 'pr-10' : 'pr-3'} py-2.5 rounded-xl bg-[#0f121a] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-sm text-neutral-100 placeholder:text-neutral-600`}
          />
          {query !== '' && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery('');
                setDebouncedQuery('');
              }}
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Sugerencias instantáneas sobre lo ya descargado. mousedown con
              preventDefault: el clic no roba el foco al input, así el blur no
              cierra el panel antes de que llegue el click de la sugerencia. */}
          {suggestionsOpen && hasSuggestions && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="absolute top-full left-0 right-0 mt-2 z-30 rounded-xl bg-[#0b0d13] border border-neutral-800 shadow-2xl overflow-hidden"
            >
              <div className="max-h-80 overflow-y-auto py-1.5">
                {suggestions.leagues.length > 0 && (
                  <SuggestionSection label="Ligas">
                    {suggestions.leagues.map((l) => (
                      <button
                        key={l.normalizedName}
                        onClick={() => applyLeagueFilter(l.name)}
                        className="w-full px-3.5 py-2 flex items-center gap-2.5 text-left hover:bg-neutral-800/50 transition-colors"
                      >
                        <Trophy className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                        <span className="flex-1 truncate text-xs font-semibold text-neutral-200">
                          {l.name}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-600">
                          {l.eventCount}
                        </span>
                      </button>
                    ))}
                  </SuggestionSection>
                )}
                {suggestions.events.length > 0 && (
                  <SuggestionSection label="Partidos / Equipos">
                    {suggestions.events.map((s) => (
                      <button
                        key={s.event.id}
                        onClick={() => openSuggestedEvent(s.event)}
                        className="w-full px-3.5 py-2 flex items-center gap-2.5 text-left hover:bg-neutral-800/50 transition-colors"
                      >
                        {s.event.isLive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-700 shrink-0" />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-xs font-semibold text-neutral-200">
                            {s.event.title}
                          </span>
                          {s.event.leagueName !== undefined && (
                            <span className="block truncate text-[10px] text-neutral-500">
                              {s.event.leagueName}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </SuggestionSection>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Tarjetas / lista compacta: la lista solo aporta en Deportes. */}
        {tab.category === 'sports' && (
          <div className="flex items-center rounded-xl bg-[#0f121a] border border-neutral-800 overflow-hidden shrink-0">
            <button
              onClick={() => changeViewMode('grid')}
              title="Tarjetas"
              aria-label="Vista de tarjetas"
              aria-pressed={viewMode === 'grid'}
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
              aria-label="Vista de lista compacta"
              aria-pressed={viewMode === 'list'}
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
          aria-label="Recargar mercados"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filtro de liga activo (elegido en una sugerencia); un toque lo quita. */}
      {leagueFilter !== null && (
        <div className="flex items-center gap-2 -mt-2">
          <button
            onClick={() => setLeagueFilter(null)}
            title="Quitar el filtro de liga"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/40 hover:bg-amber-500/15 transition-colors"
          >
            <Trophy className="w-3 h-3" />
            <span>{leagueFilter}</span>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

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

      {showLeagueBrowser ? (
        <LeagueBrowser
          leagues={leagues}
          sportLabel={subcategoryLabel(subcategory ?? '', sportInfo?.label)}
          sportIcon={subcategory !== undefined ? subcategoryIcon(subcategory) : null}
          isLoading={leaguesLoading}
          onPickLeague={setSelectedLeague}
          onBrowseAll={() => setBrowseAll(true)}
        />
      ) : isLoading && events.length === 0 ? (
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
              <span className="text-neutral-300">{filteredEvents.length}</span>{' '}
              eventos · {totalMarkets} mercados operables
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
              {hasDiscoveryFilters && (
                <button
                  onClick={clearDiscoveryFilters}
                  className="mt-1 px-4 py-2 rounded-xl bg-neutral-100 text-neutral-900 text-xs font-bold hover:bg-white transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
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
                  : selectedLeague !== null
                    ? 'Esa liga no tiene mercados operables ahora mismo.'
                    : leagueFilter !== null
                      ? 'Ningún evento cargado pertenece a esa liga ya.'
                      : liveOnly
                        ? 'No hay eventos en juego ahora mismo.'
                        : 'Esta categoría no tiene mercados operables ahora mismo.'}
              </p>
              {hasDiscoveryFilters && (
                <button
                  onClick={clearDiscoveryFilters}
                  className="mt-1 px-4 py-2 rounded-xl bg-neutral-100 text-neutral-900 text-xs font-bold hover:bg-white transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : tab.category === 'sports' && viewMode === 'list' ? (
            /* Lista compacta: filas agrupadas por día y, dentro, por liga. */
            <div className="flex flex-col gap-4">
              {groupEventsForList(visible).map((day) => {
                const dayEventCount = day.leagues.reduce(
                  (total, league) => total + league.events.length,
                  0,
                );
                return (
                  <section key={day.key} className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 px-1">
                      {day.key === 'live' ? (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500/60" />
                          <span className="relative h-2 w-2 rounded-full bg-rose-500" />
                        </span>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      )}
                      <h3
                        className={`text-[10px] font-extrabold uppercase tracking-[0.15em] ${
                          day.key === 'live' ? 'text-rose-300' : 'text-neutral-300'
                        }`}
                      >
                        {day.label}
                      </h3>
                      <span className="rounded-full border border-neutral-800 bg-[#0d1118] px-2 py-0.5 text-[9px] font-mono text-neutral-500">
                        {dayEventCount} {dayEventCount === 1 ? 'partido' : 'partidos'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      {day.leagues.map((lg) => {
                        const firstEvent = lg.events[0];
                        const sub = firstEvent?.markets[0]?.subcategory;
                        const icon = sub !== undefined ? subcategoryIcon(sub) : null;
                        const sampleStar =
                          firstEvent !== undefined
                            ? findStarMarket(firstEvent.markets)
                            : null;
                        const orderedOutcomes =
                          sampleStar !== null && firstEvent !== undefined
                            ? orderedStarOutcomes(
                                sampleStar,
                                firstEvent.participants,
                              )
                            : [];
                        const cols = Math.min(orderedOutcomes.length, 3);
                        const hasDraw = orderedOutcomes.some((outcome) =>
                          /^(draw|empate|x)$/i.test(outcome.label.trim()),
                        );
                        const matchesParticipants =
                          firstEvent?.participants?.length === 2 &&
                          orderedOutcomes.length >= 2 &&
                          orderedOutcomes[0]?.label
                            .trim()
                            .toLocaleLowerCase('es') ===
                            firstEvent.participants[0].name
                              .trim()
                              .toLocaleLowerCase('es') &&
                          orderedOutcomes[orderedOutcomes.length - 1]?.label
                            .trim()
                            .toLocaleLowerCase('es') ===
                            firstEvent.participants[1].name
                              .trim()
                              .toLocaleLowerCase('es');
                        const standardThreeWay = hasDraw && matchesParticipants;
                        const participantOutcomes =
                          firstEvent?.participants?.length === 2 &&
                          orderedOutcomes.length === 2 &&
                          orderedOutcomes.every((outcome, index) =>
                            outcome.label
                              .trim()
                              .toLocaleLowerCase('es') ===
                            firstEvent.participants?.[index]?.name
                              .trim()
                              .toLocaleLowerCase('es'),
                          );
                        const columnLabels = orderedOutcomes.map(
                          (outcome, index) =>
                            standardThreeWay
                              ? index === 1
                                ? 'X'
                                : index === 0
                                  ? '1'
                                  : '2'
                              : participantOutcomes
                                ? index === 0
                                  ? '1'
                                  : '2'
                                : translateOutcomeLabel(outcome.label),
                        );

                        return (
                          <div
                            key={lg.league}
                            className="overflow-hidden rounded-xl border border-neutral-800/80 bg-[#0b0f15]"
                          >
                            <div className="flex items-center gap-3 border-b border-neutral-800/80 bg-[#10151d] px-3 py-2.5">
                              <span className="w-11 shrink-0" />
                              <p className="flex min-w-0 flex-1 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400">
                                {icon !== null && (
                                  <span className="text-sm leading-none">{icon}</span>
                                )}
                                <span className="truncate">{lg.league}</span>
                                <span className="rounded-md bg-neutral-800/70 px-1.5 py-0.5 text-[9px] font-mono text-neutral-500">
                                  {lg.events.length}
                                </span>
                              </p>
                              {/* Los títulos de cuotas reflejan el mercado de
                                  cada grupo: 1X2, dos resultados u opciones. */}
                              {cols >= 2 && (
                                <div
                                  className={`hidden shrink-0 gap-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-neutral-600 sm:grid ${
                                    cols === 2 ? 'grid-cols-2 w-32' : 'grid-cols-3 w-48'
                                  }`}
                                >
                                  {columnLabels.slice(0, cols).map((label, index) => (
                                    <span key={`${index}-${label}`} className="truncate">
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <span className="w-10 shrink-0" />
                            </div>
                            <div className="divide-y divide-neutral-800/70">
                              {lg.events.map((event) => (
                                <EventListRow
                                  key={event.id}
                                  event={event}
                                  dense
                                  onSelectMarket={selectMarket}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
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
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Trayendo más partidos…</span>
              </div>
            ) : loadMoreError !== null ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-amber-300">{loadMoreError}</p>
                <button
                  type="button"
                  onClick={loadMore}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-emerald-500/40"
                >
                  Reintentar
                </button>
              </div>
            ) : visibleCount < filteredEvents.length || hasMore ? (
              <button
                type="button"
                onClick={reachEnd}
                className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-[11px] font-semibold text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
              >
                Ver más partidos
              </button>
            ) : (
              filteredEvents.length > 0 && (
                <p className="text-[11px] font-mono text-neutral-700">
                  {filteredEvents.length} eventos · catálogo completo de {tab.label}
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

/** Sección del panel de sugerencias: rótulo y sus filas. */
const SuggestionSection: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex flex-col">
    <p className="px-3.5 pt-2 pb-1 text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-600">
      {label}
    </p>
    {children}
  </div>
);

const SubcategoryChip: React.FC<{
  label: string;
  icon?: string | null;
  count?: number | null;
  countTitle?: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, icon, count, countTitle, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={count != null ? `${count} ${countTitle ?? 'eventos activos'}` : undefined}
    className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold whitespace-nowrap transition-all ${
      active
        ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.08)]'
        : 'border-transparent bg-transparent text-neutral-400 hover:border-neutral-800 hover:bg-white/[0.03] hover:text-neutral-200'
    }`}
  >
    {icon != null && (
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 items-center justify-center rounded-lg text-[13px] leading-none ${
          active ? 'bg-emerald-400/10' : 'bg-[#131922]'
        }`}
      >
        {icon}
      </span>
    )}
    <span>{label}</span>
    {count != null && (
      <span
        className={`rounded-md px-1.5 py-0.5 text-[9px] font-mono tabular-nums ${
          active
            ? 'bg-emerald-400/10 text-emerald-300'
            : 'bg-[#141922] text-neutral-500'
        }`}
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
