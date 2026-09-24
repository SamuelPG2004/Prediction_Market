import React, { useState } from 'react';
import { ChevronRight, Flame, Radio } from 'lucide-react';
import type { LiveScore } from '../domain/types';
import {
  findStarMarket,
  optionLabelOf,
  type MarketEventView,
} from '../utils/eventGrouping';
import { formatCompactNumber, formatLiveScorePhase } from '../utils/formatters';
import { subcategoryIcon, subcategoryLabel } from '../utils/subcategories';
import { StarMarketRow, type SelectMarketHandler } from './EventCard';

interface SportsHeroProps {
  event: MarketEventView | null;
  isLoading: boolean;
  liveScore?: LiveScore;
  onSelectMarket: SelectMarketHandler;
  onViewAll: () => void;
}

/** Partido destacado de Deportes. Solo presenta datos y callbacks del dominio. */
export const SportsHero: React.FC<SportsHeroProps> = ({
  event,
  isLoading,
  liveScore,
  onSelectMarket,
  onViewAll,
}) => {
  if (event === null) {
    return isLoading ? <SportsHeroSkeleton /> : null;
  }

  const participants = event.participants ?? [];
  const market = findStarMarket(event.markets);
  const score = liveScore?.status === 'suspended' ? undefined : liveScore;
  const isFinished = score?.status === 'finished';
  const isLive = event.isLive && !isFinished;
  const subcategory = event.markets[0]?.subcategory;
  const icon = subcategory !== undefined ? subcategoryIcon(subcategory) : null;
  const wagered = event.totalVolumeUsd ?? event.volume24hUsd;

  const openEvent = () => {
    const target =
      (market !== null && market.isQuotable ? market : undefined) ??
      event.markets.find((candidate) => candidate.isQuotable) ??
      event.markets[0];
    if (target !== undefined) onSelectMarket(event, target);
  };

  return (
    <section aria-label="En vivo y destacados" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            <Flame className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-neutral-100">
              En vivo y destacados
            </h2>
            <p className="mt-0.5 text-[10px] text-neutral-500">
              Cuotas y marcador del evento seleccionado
            </p>
          </div>
        </div>
        {isLive && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
          >
            Todos en vivo <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <article className="relative isolate overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#0c1118] shadow-[0_20px_70px_-45px_rgba(16,185,129,0.55)]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_-18%,rgba(16,185,129,0.16),transparent_58%),linear-gradient(110deg,rgba(15,23,42,0.22),transparent_48%,rgba(15,23,42,0.36))]" />

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            {icon !== null && <span className="text-sm leading-none">{icon}</span>}
            {subcategory !== undefined && (
              <span className="shrink-0 text-neutral-300">
                {subcategoryLabel(subcategory)}
              </span>
            )}
            {event.leagueName !== undefined && (
              <>
                {subcategory !== undefined && <span className="text-neutral-700">/</span>}
                <span className="truncate">{event.leagueName}</span>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {wagered !== null && (
              <span
                className="hidden items-center gap-1 text-[10px] font-mono text-neutral-500 sm:flex"
                title="Volumen reportado por la fuente"
              >
                <Flame className="h-3 w-3 text-amber-400" />
                ${formatCompactNumber(wagered)}
              </span>
            )}
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-rose-300">
                <Radio className="h-3 w-3" /> En vivo
              </span>
            ) : isFinished ? (
              <span className="rounded-full border border-neutral-700 bg-neutral-800/60 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-neutral-300">
                Final
              </span>
            ) : (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-emerald-300">
                Destacado
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={openEvent}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 py-5 text-left transition-colors hover:bg-white/[0.015] sm:px-8 sm:py-6"
          title="Abrir los mercados del evento"
        >
          {participants.length >= 2 ? (
            <>
              <HeroParticipant participant={participants[0]} align="right" />
              <div className="flex min-w-[76px] flex-col items-center justify-center px-1">
                {score !== undefined ? (
                  <span className="font-display text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">
                    {score.home}
                    <span className="mx-1.5 text-neutral-600">:</span>
                    {score.guest}
                  </span>
                ) : (
                  <span className="font-mono text-xs font-bold tracking-[0.2em] text-neutral-600">
                    VS
                  </span>
                )}
                {score !== undefined ? (
                  <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    {score.status === 'finished'
                      ? 'Final'
                      : score.status === 'live'
                        ? formatLiveScorePhase(score) ?? 'En juego'
                        : 'Marcador no disponible'}
                  </span>
                ) : (
                  <span className="mt-1 text-[10px] text-neutral-600">
                    {event.markets[0]?.closesAt?.toLocaleTimeString('es', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }) ?? 'Próximo partido'}
                  </span>
                )}
              </div>
              <HeroParticipant participant={participants[1]} align="left" />
            </>
          ) : (
            <div className="col-span-3 py-1 text-center">
              <span className="font-display text-lg font-bold text-white sm:text-2xl">
                {event.title}
              </span>
              {score !== undefined && (
                <span className="ml-3 font-mono text-2xl font-bold tabular-nums text-emerald-300">
                  {score.home}:{score.guest}
                </span>
              )}
            </div>
          )}
        </button>

        {market !== null ? (
          <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                {optionLabelOf(market)}
              </span>
              <span className="shrink-0 text-[9px] font-mono text-neutral-600">
                Selecciona una cuota
              </span>
            </div>
            <StarMarketRow
              market={market}
              participants={participants}
              onPick={(outcomeId) => onSelectMarket(event, market, outcomeId)}
              hideLabel
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={openEvent}
            className="m-4 mt-0 w-[calc(100%-2rem)] rounded-xl border border-neutral-700 bg-neutral-900/70 py-2.5 text-xs font-bold text-neutral-200 hover:border-emerald-500/40 hover:text-emerald-300"
          >
            Ver mercados del evento
          </button>
        )}
      </article>
    </section>
  );
};

const HeroParticipant: React.FC<{
  participant: { name: string; imageUrl?: string };
  align: 'left' | 'right';
}> = ({ participant, align }) => {
  const [failed, setFailed] = useState(false);
  const isRight = align === 'right';

  return (
    <span
      className={`flex min-w-0 items-center gap-2.5 ${isRight ? 'flex-row-reverse text-right' : 'text-left'}`}
    >
      {participant.imageUrl !== undefined && !failed ? (
        <img
          src={participant.imageUrl}
          alt=""
          loading="eager"
          decoding="async"
          width={44}
          height={44}
          onError={() => setFailed(true)}
          className="h-10 w-10 shrink-0 rounded-full border border-white/10 bg-[#111820] object-contain p-1 sm:h-12 sm:w-12"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#111820] text-sm font-bold text-neutral-400 sm:h-12 sm:w-12">
          {participant.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 truncate text-[11px] font-bold leading-snug text-neutral-200 sm:text-sm">
        {participant.name}
      </span>
    </span>
  );
};

const SportsHeroSkeleton: React.FC = () => (
  <section
    aria-label="Cargando partido destacado"
    className="overflow-hidden rounded-2xl border border-neutral-800 bg-[#0c1118] p-4 sm:p-5"
  >
    <div className="flex animate-pulse flex-col gap-5">
      <div className="h-3 w-40 rounded bg-neutral-800" />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3">
        <div className="ml-auto h-10 w-32 rounded bg-neutral-800/80" />
        <div className="h-7 w-16 rounded bg-neutral-800/80" />
        <div className="h-10 w-32 rounded bg-neutral-800/80" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="h-12 rounded-xl bg-neutral-800/60" />
        <div className="h-12 rounded-xl bg-neutral-800/60" />
        <div className="h-12 rounded-xl bg-neutral-800/60" />
      </div>
    </div>
  </section>
);
