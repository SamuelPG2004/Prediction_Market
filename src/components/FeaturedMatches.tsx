import React, { useState } from 'react';
import { Flame } from 'lucide-react';
import { useFeaturedEvents } from '../hooks/useFeaturedEvents';
import { findStarMarket, type MarketEventView } from '../utils/eventGrouping';
import { formatCompactNumber, formatEventDate } from '../utils/formatters';
import { subcategoryIcon, subcategoryLabel } from '../utils/subcategories';
import { StarMarketRow, type SelectMarketHandler } from './EventCard';

/** Cuántos partidos pide el carrusel. */
const FEATURED_COUNT = 8;

/**
 * Carrusel de partidos destacados: lo más apostado ahora mismo según los
 * venues que saben rankear popularidad. Solo dominio: no sabe de qué venue
 * viene cada partido.
 *
 * La sección es opcional por diseño: sin datos (fuente caída, catálogo vacío,
 * modo lectura sin credenciales) desaparece entera en vez de mostrar un hueco.
 */
export const FeaturedMatches: React.FC<{
  onSelectMarket: SelectMarketHandler;
}> = ({ onSelectMarket }) => {
  const { events, isLoading } = useFeaturedEvents(FEATURED_COUNT);

  if (!isLoading && events.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Flame className="w-3.5 h-3.5 text-amber-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
          Partidos destacados
        </h2>
        <span className="text-[10px] font-mono text-neutral-600">
          lo más apostado ahora
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => <FeaturedSkeleton key={i} />)
          : events.map((event) => (
              <FeaturedCard
                key={event.id}
                event={event}
                onSelectMarket={onSelectMarket}
              />
            ))}
      </div>
    </section>
  );
};

const FeaturedCard: React.FC<{
  event: MarketEventView;
  onSelectMarket: SelectMarketHandler;
}> = ({ event, onSelectMarket }) => {
  const [a, b] = event.participants!;
  const star = findStarMarket(event.markets);
  const subcategory = event.markets[0]?.subcategory;
  const icon = subcategory !== undefined ? subcategoryIcon(subcategory) : null;
  const wagered = event.totalVolumeUsd ?? event.volume24hUsd;

  const open = () => {
    const target =
      (star !== null && star.isQuotable ? star : undefined) ??
      event.markets.find((m) => m.isQuotable) ??
      event.markets[0];
    if (target !== undefined) onSelectMarket(event, target);
  };

  return (
    <div className="w-[290px] shrink-0 snap-start rounded-2xl bg-[#0d1017] border border-neutral-800/80 hover:border-neutral-700 transition-colors p-3.5 flex flex-col gap-2.5">
      {/* Liga + en vivo / comienzo */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9.5px] font-mono uppercase tracking-wide text-neutral-400 truncate flex items-center gap-1 min-w-0">
          {icon !== null && <span className="text-[11px]">{icon}</span>}
          <span className="truncate">
            {[
              subcategory !== undefined ? subcategoryLabel(subcategory) : null,
              event.leagueName ?? null,
            ]
              .filter((p): p is string => p !== null)
              .join(' · ')}
          </span>
        </span>
        {/* El dato que justifica el destaque: cuánto hay apostado aquí. */}
        {wagered !== null && (
          <span
            className="flex items-center gap-0.5 text-[9px] font-mono font-semibold text-amber-400/90 shrink-0"
            title="Total apostado a este evento"
          >
            <Flame className="w-2.5 h-2.5" />${formatCompactNumber(wagered)}
          </span>
        )}
        {event.isLive ? (
          <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-rose-400 uppercase shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            En vivo
          </span>
        ) : (
          event.markets[0]?.closesAt != null && (
            <span className="text-[9.5px] font-mono text-neutral-600 shrink-0">
              {formatEventDate(event.markets[0].closesAt)}
            </span>
          )
        )}
      </div>

      {/* Enfrentamiento compacto. Clicable: abre el boleto. */}
      <button
        onClick={open}
        className="flex items-center gap-2 text-left cursor-pointer min-w-0"
        title="Abrir este evento"
      >
        <FeaturedLogo participant={a} />
        <span className="flex-1 text-[12.5px] font-semibold text-neutral-100 leading-tight min-w-0">
          <span className="line-clamp-1">{a.name}</span>
          <span className="line-clamp-1 text-neutral-300">{b.name}</span>
        </span>
        <FeaturedLogo participant={b} />
      </button>

      {/* Cuotas del mercado estrella; el clic preselecciona el resultado. */}
      {star !== null && (
        <StarMarketRow
          market={star}
          participants={event.participants}
          onPick={(outcomeId) => onSelectMarket(event, star, outcomeId)}
        />
      )}
    </div>
  );
};

const FeaturedLogo: React.FC<{
  participant: { name: string; imageUrl?: string };
}> = ({ participant }) => {
  const [failed, setFailed] = useState(false);

  if (participant.imageUrl === undefined || failed) {
    return (
      <span className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700/50 flex items-center justify-center shrink-0 text-[11px] font-bold text-neutral-500">
        {participant.name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={participant.imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      width={32}
      height={32}
      onError={() => setFailed(true)}
      className="w-8 h-8 rounded-full object-contain bg-neutral-900 border border-neutral-800 shrink-0 p-0.5"
    />
  );
};

/** Silueta de tarjeta destacada: el carrusel no salta al llegar los datos. */
const FeaturedSkeleton: React.FC = () => (
  <div className="w-[290px] shrink-0 rounded-2xl bg-[#0d1017] border border-neutral-800/80 p-3.5 flex flex-col gap-3 animate-pulse">
    <div className="h-2.5 rounded bg-neutral-800/60 w-1/2" />
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-neutral-800/80 shrink-0" />
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="h-2.5 rounded bg-neutral-800/80 w-4/5" />
        <div className="h-2.5 rounded bg-neutral-800/60 w-3/5" />
      </div>
      <div className="w-8 h-8 rounded-full bg-neutral-800/80 shrink-0" />
    </div>
    <div className="grid grid-cols-3 gap-2">
      <div className="h-11 rounded-lg bg-neutral-800/50" />
      <div className="h-11 rounded-lg bg-neutral-800/50" />
      <div className="h-11 rounded-lg bg-neutral-800/50" />
    </div>
  </div>
);
