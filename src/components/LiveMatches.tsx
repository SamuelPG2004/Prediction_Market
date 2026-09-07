import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { LiveScore } from '../domain/types';
import type { MarketEventView } from '../utils/eventGrouping';
import { FeaturedCard, FeaturedSkeleton } from './FeaturedMatches';
import type { SelectMarketHandler } from './EventCard';

/** Cuántos partidos en juego pide el carrusel. */
export const LIVE_COUNT = 10;

/**
 * Sección "En vivo": los partidos en juego ahora mismo, en carrusel, con sus
 * cuotas moviéndose (el hook refresca cada pocos segundos y los botones
 * destellan al cambiar el precio) y su marcador en push cuando el venue lo
 * publica (`scores`, por id de evento). "Ver todos" salta al filtro en vivo
 * de Deportes.
 *
 * Sin partidos en juego, la sección desaparece entera: un rótulo "En vivo"
 * vacío a las 4 de la mañana solo enseñaría un hueco.
 */
export const LiveMatches: React.FC<{
  events: MarketEventView[];
  isLoading: boolean;
  scores: ReadonlyMap<string, LiveScore>;
  onSelectMarket: SelectMarketHandler;
  onViewAll: () => void;
}> = ({ events, isLoading, scores, onSelectMarket, onViewAll }) => {
  if (!isLoading && events.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="relative flex w-2.5 h-2.5">
          <span className="absolute inline-flex w-full h-full rounded-full bg-rose-500 opacity-60 animate-ping" />
          <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-rose-500" />
        </span>
        <h2 className="text-xs font-bold uppercase tracking-wider text-rose-300">
          En vivo
        </h2>
        <span className="text-[10px] font-mono text-neutral-600">
          {isLoading && events.length === 0
            ? 'buscando partidos en juego…'
            : `${events.length} ${events.length === 1 ? 'partido' : 'partidos'} en juego`}
        </span>
        <button
          onClick={onViewAll}
          className="ml-auto flex items-center gap-0.5 text-[11px] font-semibold text-rose-400/90 hover:text-rose-300 transition-colors"
        >
          Ver todos
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
        {isLoading && events.length === 0
          ? Array.from({ length: 3 }, (_, i) => <FeaturedSkeleton key={i} />)
          : events.map((event) => (
              <FeaturedCard
                key={event.id}
                event={event}
                onSelectMarket={onSelectMarket}
                accent="live"
                liveScore={scores.get(event.id)}
              />
            ))}
      </div>
    </section>
  );
};
