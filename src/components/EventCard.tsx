import React, { useState } from 'react';
import {
  Activity,
  CalendarDays,
  CircleHelp,
  Clapperboard,
  CloudSun,
  Coins,
  Cpu,
  Droplets,
  Landmark,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { Market, MarketCategory } from '../domain/types';
import {
  findStarMarket,
  groupMarketsForDisplay,
  marketVariantLabelOf,
  optionLabelOf,
  type MarketEventView,
} from '../utils/eventGrouping';
import {
  formatCompactNumber,
  formatEventDate,
  formatEventTime,
} from '../utils/formatters';
import { translateOutcomeLabel } from '../utils/marketLabels';
import { subcategoryIcon, subcategoryLabel } from '../utils/subcategories';
import { useBetSlip } from '../hooks/useBetSlip';
import { StarOutcomeButton, orderedStarOutcomes, favoritePriceOf, outcomeDisplay } from './MarketOdds';
export { StarMarketRow, orderedStarOutcomes } from './MarketOdds';
import { SportsMarketPreview } from './SportsMarketPreview';
import { displaySportsMarket } from '../utils/sportsMarkets';

/** Cuántas opciones se listan antes de resumir el resto. */
const MAX_VISIBLE_OPTIONS = 4;

const PREDICTION_CATEGORY_LABEL: Partial<Record<MarketCategory, string>> = {
  politics: 'Política',
  crypto: 'Cripto',
  economy: 'Economía',
  tech: 'Tecnología',
  culture: 'Cultura',
  weather: 'Clima',
  other: 'Otros temas',
};

const PREDICTION_CATEGORY_ICON: Partial<Record<MarketCategory, LucideIcon>> = {
  politics: Landmark,
  crypto: Coins,
  economy: Activity,
  tech: Cpu,
  culture: Clapperboard,
  weather: CloudSun,
  other: CircleHelp,
};

const PREDICTION_CATEGORY_TILE: Partial<Record<MarketCategory, string>> = {
  politics: 'bg-[#30313c] text-[#e9c391]',
  crypto: 'bg-[#2d2c42] text-[#c5b8ff]',
  economy: 'bg-[#233b38] text-[#9cddc9]',
  tech: 'bg-[#233944] text-[#93d7e5]',
  culture: 'bg-[#3a303b] text-[#e5afc0]',
  weather: 'bg-[#28394b] text-[#a9caed]',
  other: 'bg-[#2d3540] text-[#b6c8d4]',
};

/**
 * Abre el boleto de apuesta en un mercado concreto del evento; `outcomeId`
 * preselecciona el resultado clicado (la cuota exacta que el usuario tocó).
 */
export type SelectMarketHandler = (
  event: MarketEventView,
  market: Market,
  outcomeId?: string,
) => void;

interface EventCardProps {
  event: MarketEventView;
  onSelectMarket: SelectMarketHandler;
  /**
   * Carga la imagen con prioridad. Se usa en las primeras tarjetas: con `lazy`
   * en todas, la parte visible aparece sin imágenes durante un instante.
   */
  eagerImage?: boolean;
}

/**
 * Tarjeta de evento. Solo conoce el dominio: no sabe de qué venue viene nada.
 *
 * Tres presentaciones según la forma del evento:
 *  - enfrentamiento (dos participantes conocidos): escudos "A vs B", liga y el
 *    mercado estrella (ganador del partido) con sus cuotas.
 *  - binario (un solo mercado de dos resultados): porcentaje grande y un botón
 *    por resultado.
 *  - multi-mercado sin participantes: lista de opciones con su probabilidad.
 *
 * Un resultado sin cotización se muestra como "—", jamás como 0%.
 */
export const EventCard: React.FC<EventCardProps> = ({
  event,
  onSelectMarket,
  eagerImage = false,
}) => {
  const isMatchup = event.participants !== undefined && event.participants.length === 2;
  const isPrediction = event.markets[0]?.category !== 'sports';

  /**
   * Clic en la cabecera o en "Ver los N mercados": abre el panel en el mercado
   * estrella si cotiza (llegar a un partido por "Ver los 26 mercados" y caer
   * en un hándicap cualquiera desorienta), o en el primer cotizable.
   */
  const openEvent = () => {
    const star = findStarMarket(event.markets);
    const target =
      (star !== null && star.isQuotable ? star : undefined) ??
      event.markets.find((m) => m.isQuotable) ??
      event.markets[0];
    if (target !== undefined) onSelectMarket(event, target);
  };

  return (
    <div className={`group relative overflow-hidden rounded-2xl border transition-all duration-200 flex flex-col ${
      isPrediction
        ? 'bg-[#121a22] border-[#293741] hover:border-[#5a8f93]/60 hover:shadow-[0_14px_36px_rgba(35,115,112,0.09)]'
        : 'bg-[#12151d] border-white/[0.08] p-4 sm:p-5 gap-4 hover:border-emerald-400/30'
    }`}>
      {isPrediction ? (
        <PredictionBody event={event} eagerImage={eagerImage} onOpen={openEvent} onSelectMarket={onSelectMarket} />
      ) : isMatchup ? (
        <MatchupBody event={event} eagerImage={eagerImage} onOpen={openEvent} onSelectMarket={onSelectMarket} />
      ) : (
        <GenericBody event={event} eagerImage={eagerImage} onOpen={openEvent} onSelectMarket={onSelectMarket} />
      )}

      {/* Pie: métricas. Las que el venue no aporta no se inventan: se omiten. */}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-800/60 mt-auto ${
        isPrediction
          ? 'bg-[#0e151c] px-4 py-3 text-[11px] text-neutral-500 sm:px-5'
          : 'pt-2.5 text-[10px] font-mono text-neutral-500'
      }`}>
        {event.liquidityUsd !== null && (
          <span className="flex items-center gap-1.5" title="Liquidez">
            <Droplets className="w-3 h-3 text-sky-300/70" />
            <span>Liquidez</span>
            <strong className={`font-semibold ${isPrediction ? 'text-neutral-200' : 'text-neutral-300'}`}>${formatCompactNumber(event.liquidityUsd)}</strong>
          </span>
        )}
        {event.volume24hUsd !== null && (
          <span className="flex items-center gap-1.5" title="Volumen 24h">
            <Activity className="w-3 h-3 text-emerald-300/70" />
            <span>24 h</span>
            <strong className={`font-semibold ${isPrediction ? 'text-neutral-200' : 'text-neutral-300'}`}>${formatCompactNumber(event.volume24hUsd)}</strong>
          </span>
        )}
        {/* En un enfrentamiento, el estado/hora ya va en su cabecera. */}
        {!isMatchup && !isPrediction &&
          (event.isLive ? (
            <span className="text-rose-400" title="En juego ahora mismo">
              En juego
            </span>
          ) : (
            event.markets[0]?.closesAt != null && (
              <span title="Comienzo">
                {formatEventDate(event.markets[0].closesAt)}
              </span>
            )
          ))}
        {!isPrediction && (
          <span className="ml-auto text-neutral-600">
            {event.markets.length}{' '}
            {event.markets.length === 1 ? 'mercado' : 'mercados'}
          </span>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Presentación "enfrentamiento": escudos, liga y mercado estrella
// ---------------------------------------------------------------------------

const MatchupBody: React.FC<{
  event: MarketEventView;
  eagerImage: boolean;
  onOpen: () => void;
  onSelectMarket: SelectMarketHandler;
}> = ({ event, eagerImage, onOpen, onSelectMarket }) => {
  const [a, b] = event.participants!;


  return (
    <>
      {/* Liga y, a la derecha, en vivo o la hora del partido */}
      <div className="flex items-center justify-between gap-2">
        <ContextLine
          subcategory={event.markets[0]?.subcategory}
          leagueName={event.leagueName}
        />
        {event.isLive ? (
          <LiveBadge />
        ) : (
          event.markets[0]?.closesAt != null && (
            <span
              className="text-[10px] font-mono text-neutral-400 shrink-0"
              title="Comienzo"
            >
              {formatEventDate(event.markets[0].closesAt)}
            </span>
          )
        )}
      </div>

      {/* Enfrentamiento: escudo A · vs · escudo B. Clicable: abre el panel. */}
      <button
        onClick={onOpen}
        className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 cursor-pointer"
        title="Abrir este evento"
      >
        <ParticipantColumn participant={a} eager={eagerImage} />
        <span className="text-[10px] font-mono font-bold text-neutral-600 self-center pb-4">
          VS
        </span>
        <ParticipantColumn participant={b} eager={eagerImage} />
      </button>

      <SportsMarketPreview event={event} onSelectMarket={onSelectMarket} />
    </>
  );
};

const ParticipantColumn: React.FC<{
  participant: { name: string; imageUrl?: string };
  eager: boolean;
}> = ({ participant, eager }) => (
  <span className="flex flex-col items-center gap-1.5 min-w-0">
    <ParticipantLogo participant={participant} eager={eager} />
    <span className="text-xs font-semibold text-neutral-100 text-center leading-tight line-clamp-2">
      {participant.name}
    </span>
  </span>
);

/** Escudo del participante; si no carga, su inicial en vez de un hueco roto. */
const ParticipantLogo: React.FC<{
  participant: { name: string; imageUrl?: string };
  eager: boolean;
}> = ({ participant, eager }) => {
  const [failed, setFailed] = useState(false);

  if (participant.imageUrl === undefined || failed) {
    return (
      <span className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700/50 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-neutral-500">
          {participant.name.charAt(0).toUpperCase()}
        </span>
      </span>
    );
  }

  return (
    <img
      src={participant.imageUrl}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      width={40}
      height={40}
      onError={() => setFailed(true)}
      className="w-10 h-10 rounded-full object-contain bg-neutral-900 border border-neutral-800 shrink-0 p-0.5"
    />
  );
};

/**
 * Fila del modo lista: hora, enfrentamiento y las cuotas del mercado estrella
 * en una sola línea. Caben varias veces más partidos por pantalla que con la
 * tarjeta; el día y la liga los ponen las cabeceras de la lista.
 */
export const EventListRow: React.FC<{
  event: MarketEventView;
  onSelectMarket: SelectMarketHandler;
  dense?: boolean;
}> = ({ event, onSelectMarket, dense = false }) => {
  const { isSelected } = useBetSlip();
  const isMatchup =
    event.participants !== undefined && event.participants.length === 2;
  const star = displaySportsMarket(event.markets);

  const open = () => {
    const target =
      (star !== null && star.isQuotable ? star : undefined) ??
      event.markets.find((m) => m.isQuotable) ??
      event.markets[0];
    if (target !== undefined) onSelectMarket(event, target);
  };

  const outcomes =
    star !== null ? orderedStarOutcomes(star, event.participants) : [];
  const favoritePrice =
    star !== null ? favoritePriceOf(outcomes, star.priceFormat) : null;

  return (
    <div
      className={`flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-3 px-3 sm:px-4 py-3.5 transition-colors ${
        dense
          ? 'bg-transparent odd:bg-white/[0.015] hover:bg-white/[0.045]'
          : 'rounded-xl bg-[#0d1017] border border-neutral-800/70 hover:border-neutral-700'
      }`}
    >
      {/* Hora o en juego */}
      <span className="w-11 shrink-0 text-[10px] font-mono text-neutral-500">
        {event.isLive ? (
          <span className="flex items-center gap-1 text-rose-400 font-bold uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Vivo
          </span>
        ) : event.markets[0]?.closesAt != null ? (
          formatEventTime(event.markets[0].closesAt)
        ) : (
          '—'
        )}
      </span>

      {/* Enfrentamiento (o título). Clicable: abre el panel del evento. */}
      <button
        onClick={open}
        className="flex-1 min-w-0 text-left flex flex-col gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 rounded-lg"
        title="Abrir este evento"
      >
        {isMatchup ? (
          event.participants!.map((p) => (
            <span key={p.name} className="flex min-w-0 items-center gap-2">
              <ParticipantListCrest participant={p} />
              <span className="truncate text-sm font-semibold leading-tight text-neutral-100">
                {p.name}
              </span>
            </span>
          ))
        ) : (
          <span className="text-[12.5px] font-semibold text-neutral-100 leading-tight line-clamp-2">
            {event.title}
          </span>
        )}
      </button>

      {star !== null && <span className="order-last w-full text-[10px] text-neutral-400 sm:order-none sm:w-24 sm:shrink-0 truncate" title={optionLabelOf(star)}>{optionLabelOf(star)}</span>}
      {/* Cuotas del mercado estrella, compactas. En móvil no caben en la
          línea (los anchos fijos se comen el título): bajan a una segunda
          fila a ancho completo, detrás del contador (order-last). */}
      {star !== null && outcomes.length >= 2 && (
        <div
          className={`grid gap-1.5 shrink-0 order-last sm:order-none w-full ${
            outcomes.length === 2 ? 'grid-cols-2 sm:w-60' : 'grid-cols-3 sm:w-60'
          }`}
        >
          {outcomes.map((o) => (
            <StarOutcomeButton
              key={o.id}
              outcome={o}
              priceFormat={star.priceFormat}
              isFavorite={o.price !== null && Number(o.price) === favoritePrice}
              inSlip={isSelected(star.id, o.id)}
              onPick={() => onSelectMarket(event, star, o.id)}
              compact
            />
          ))}
        </div>
      )}

      {/* Puerta al resto de mercados del evento. Ancho FIJO: si varía con
          los dígitos, las columnas de cuotas dejan de alinearse fila a fila. */}
      <button
        onClick={open}
        className="shrink-0 w-12 min-h-11 py-1.5 rounded-lg border border-white/[0.06] text-[11px] font-mono tabular-nums text-center text-neutral-500 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
        title={`Ver los ${event.markets.length} mercados del evento`}
      >
        {event.markets.length} →
      </button>
    </div>
  );
};

/** Escudo compacto para la pizarra; carga diferida para no bloquear el listado. */
const ParticipantListCrest: React.FC<{
  participant: { name: string; imageUrl?: string };
}> = ({ participant }) => {
  const [failed, setFailed] = useState(false);
  const imageUrl = participant.imageUrl?.trim();

  if (imageUrl === undefined || imageUrl === '' || failed) {
    return (
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700/80 bg-neutral-800 text-[9px] font-extrabold text-neutral-400"
      >
        {participant.name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      width={20}
      height={20}
      onError={() => setFailed(true)}
      className="h-5 w-5 shrink-0 rounded-md border border-white/[0.08] bg-[#111820] object-contain p-0.5"
    />
  );
};

// ---------------------------------------------------------------------------
// Presentación genérica (binaria o lista de opciones)
// ---------------------------------------------------------------------------

/** Presentación editorial propia para mercados de predicción. */
const PredictionBody: React.FC<{
  event: MarketEventView;
  eagerImage: boolean;
  onOpen: () => void;
  onSelectMarket: SelectMarketHandler;
}> = ({ event, eagerImage, onOpen, onSelectMarket }) => {
  const category = event.markets[0]?.category ?? 'other';
  const marketCount = event.markets.length;
  const closesAt = event.markets[0]?.closesAt;
  const status = event.markets[0]?.status;
  const statusLabel =
    status === 'suspended'
      ? 'Suspendido'
      : status === 'closed'
        ? 'Cerrado'
        : status === 'resolved'
          ? 'Resuelto'
          : null;

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3.5 px-4 pt-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83d9ce] sm:gap-4 sm:px-5 sm:pt-5"
        title="Abrir este mercado"
      >
        <PredictionArtwork event={event} category={category} eager={eagerImage} />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex min-h-5 items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[#9edbd2]">
              {React.createElement(PREDICTION_CATEGORY_ICON[category] ?? Sparkles, { className: 'h-3.5 w-3.5 shrink-0' })}
              <span className="truncate">{PREDICTION_CATEGORY_LABEL[category] ?? 'Predicción'}</span>
            </span>
            {statusLabel !== null ? (
              <span className="shrink-0 text-[10px] text-neutral-500">{statusLabel}</span>
            ) : closesAt ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-[#d8b979]">
                <CalendarDays className="h-3 w-3" />
                Cierra {formatEventDate(closesAt)}
              </span>
            ) : null}
          </div>
          <h3 className="font-display text-[16px] font-semibold leading-[1.28] tracking-[-0.025em] text-[#edf3f5] line-clamp-3 group-hover:text-white sm:text-[17px]">
            {event.title}
          </h3>
          {(marketCount > 1 || event.markets[0]?.subcategory) && (
            <p className="mt-2 truncate text-[10px] text-[#84939b]">
              {event.markets[0]?.subcategory ?? `${marketCount} mercados disponibles`}
            </p>
          )}
        </div>
      </button>

      {event.isBinary ? (
        <PredictionBinaryBody
          market={event.markets[0]}
          onPick={(market, outcomeId) => onSelectMarket(event, market, outcomeId)}
        />
      ) : (
        <OptionList event={event} onSelectMarket={onSelectMarket} prediction />
      )}
    </>
  );
};

const PredictionArtwork: React.FC<{
  event: MarketEventView;
  category: MarketCategory;
  eager: boolean;
}> = ({ event, category, eager }) => {
  const [failed, setFailed] = useState(false);
  const Icon = PREDICTION_CATEGORY_ICON[category] ?? Sparkles;

  return (
    <div className={`relative isolate flex h-[78px] w-[78px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] ${PREDICTION_CATEGORY_TILE[category] ?? PREDICTION_CATEGORY_TILE.other}`}>
      {event.imageUrl && !failed && (
        <img
          src={event.imageUrl}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {(!event.imageUrl || failed) && (
        <div aria-hidden="true" className="flex h-full w-full items-center justify-center">
          <Icon className="h-8 w-8 stroke-[1.4]" />
        </div>
      )}
    </div>
  );
};

const PredictionBinaryBody: React.FC<{
  market: Market;
  onPick: (market: Market, outcomeId?: string) => void;
}> = ({ market, onPick }) => {
  const { isSelected } = useBetSlip();

  return (
    <div className="grid grid-cols-2 gap-2.5 px-4 pb-4 pt-4 sm:gap-3 sm:px-5 sm:pb-5">
      {market.outcomes.slice(0, 2).map((outcome) => {
        const display = outcomeDisplay(outcome.price, outcome.probability, market.priceFormat);
        const inSlip = isSelected(market.id, outcome.id);
        const label = translateOutcomeLabel(outcome.label);

        return (
          <button
            key={outcome.id}
            type="button"
            onClick={() => onPick(market, outcome.id)}
            aria-pressed={inSlip}
            aria-label={`${label} · ${display.primary ?? 'sin cotización'}`}
            title={inSlip ? `${label} — en el boleto` : 'Añadir al boleto'}
            className={`group/choice min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83d9ce] ${
              inSlip
                ? 'border-[#83d9ce]/70 bg-[#83d9ce]/[0.12] ring-1 ring-[#83d9ce]/15'
                : 'border-white/[0.08] bg-[#17232d] hover:border-[#83d9ce]/35 hover:bg-[#1b2b35]'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`truncate text-[11px] font-semibold ${inSlip ? 'text-[#b9f0e7]' : 'text-[#b5c4cb]'}`}>
                {label}
              </span>
            </span>
            <span className={`mt-1.5 block font-display text-[21px] font-semibold leading-none tabular-nums ${display.primary === null ? 'text-neutral-500' : 'text-[#edf3f5]'}`}>
              {display.primary ?? '—'}
            </span>
            <span className="mt-1 block text-[10px] text-neutral-500">
              {display.secondary !== null
                ? `${display.secondary} de probabilidad`
                : display.primary === null
                  ? 'Sin cotización'
                  : market.priceFormat === 'probability'
                    ? 'Probabilidad'
                    : 'Cuota'}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const GenericBody: React.FC<{
  event: MarketEventView;
  eagerImage: boolean;
  onOpen: () => void;
  onSelectMarket: SelectMarketHandler;
}> = ({ event, eagerImage, onOpen, onSelectMarket }) => (
  <>
    {/* Cabecera: imagen + título. Clicable: abre el panel de operación. */}
    <button
      onClick={onOpen}
      className="flex items-start gap-3 text-left cursor-pointer"
      title="Abrir este evento"
    >
      <EventImage event={event} eager={eagerImage} />

      <div className="flex-1 min-w-0">
        {event.markets[0]?.category !== 'sports' && (
          <span className="mb-1.5 inline-flex rounded-md border border-sky-300/15 bg-sky-300/[0.07] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-sky-200/80">
            {PREDICTION_CATEGORY_LABEL[event.markets[0]?.category ?? 'other'] ?? 'Predicción'}
          </span>
        )}
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-100 leading-snug line-clamp-2 group-hover:text-white flex-1">
            {event.title}
          </h3>
          {event.isLive && <LiveBadge />}
        </div>
        <ContextLine
          subcategory={event.markets[0]?.subcategory}
          leagueName={event.leagueName}
        />
      </div>
    </button>

    {/* Cuerpo: binario o lista de opciones */}
    {event.isBinary ? (
      <BinaryBody
        market={event.markets[0]}
        onPick={(m, outcomeId) => onSelectMarket(event, m, outcomeId)}
      />
    ) : (
      <OptionList event={event} onSelectMarket={onSelectMarket} />
    )}
  </>
);

/**
 * Lista de opciones con expandir/plegar, común a varias presentaciones.
 * Ordenada por grupos (ganador primero, líneas de menor a mayor) y con la
 * línea en la etiqueta cuando el título se repite: tres "Total Games" seguidos
 * sin más contexto no se pueden distinguir.
 */
const OptionList: React.FC<{
  event: MarketEventView;
  onSelectMarket: SelectMarketHandler;
  prediction?: boolean;
}> = ({ event, onSelectMarket, prediction = false }) => {
  const [expanded, setExpanded] = useState(false);

  const rows = groupMarketsForDisplay(event.markets).flatMap((g) =>
    g.markets.map((m) =>
      g.markets.length === 1
        ? { market: m, label: g.label }
        : { market: m, label: `${g.label} · ${marketVariantLabelOf(m)}` },
    ),
  );

  const visibleRows = expanded ? rows : rows.slice(0, MAX_VISIBLE_OPTIONS);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <div className={`flex flex-col ${prediction ? 'divide-y divide-white/[0.07] px-4 pb-2 pt-1 sm:px-5 sm:pb-3' : 'gap-1'}`}>
      {visibleRows.map((r) => (
        <OptionRow
          key={r.market.id}
          market={r.market}
          label={r.label}
          prediction={prediction}
          onPick={() => onSelectMarket(event, r.market)}
        />
      ))}

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className={`mt-0.5 py-2 text-left text-[11px] font-semibold transition-colors ${prediction ? 'text-[#9edbd2] hover:text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          + {hiddenCount} opciones más
        </button>
      )}
      {expanded && event.markets.length > MAX_VISIBLE_OPTIONS && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-0.5 py-1.5 text-left text-[11px] font-semibold text-neutral-500 transition-colors hover:text-neutral-300"
        >
          Mostrar menos
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

/** "⚽ Fútbol · NPL NSW": deporte traducido y liga, lo que haya. */
const ContextLine: React.FC<{
  subcategory: string | undefined;
  leagueName: string | undefined;
}> = ({ subcategory, leagueName }) => {
  if (subcategory === undefined && leagueName === undefined) return null;
  const icon = subcategory !== undefined ? subcategoryIcon(subcategory) : null;
  const parts = [
    subcategory !== undefined ? subcategoryLabel(subcategory) : null,
    leagueName ?? null,
  ].filter((p): p is string => p !== null);

  return (
    <span className="text-[10px] text-neutral-400 truncate flex items-center gap-1 min-w-0">
      {icon !== null && <span className="text-[11px]">{icon}</span>}
      <span className="truncate uppercase font-mono tracking-wide">
        {parts.join(' · ')}
      </span>
    </span>
  );
};

const LiveBadge: React.FC = () => (
  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-[9px] font-mono font-bold text-rose-400 uppercase tracking-wider shrink-0">
    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
    En vivo
  </span>
);

/**
 * Qué número enseñar para un resultado: en venues de cuota decimal, la cuota
 * grande y el % pequeño (es lo que espera quien apuesta a deportes); en venues
 * de probabilidad, solo el %. Sin precio no se inventa nada.
 */

/**
 * Imagen del evento con reserva: si no carga (o no hay), la inicial del
 * título en vez de un hueco roto.
 */
const EventImage: React.FC<{ event: MarketEventView; eager?: boolean }> = ({
  event,
  eager,
}) => {
  const [failed, setFailed] = useState(false);

  if (!event.imageUrl || failed) {
    return (
      <div className="w-11 h-11 rounded-xl bg-neutral-800 border border-neutral-700/50 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-neutral-500">
          {event.title.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <img
      src={event.imageUrl}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      width={44}
      height={44}
      onError={() => setFailed(true)}
      className="w-11 h-11 rounded-xl object-cover bg-neutral-900 border border-neutral-800 shrink-0"
    />
  );
};

/** Evento binario: probabilidad grande y un botón por resultado. */
const BinaryBody: React.FC<{
  market: Market;
  onPick: (m: Market, outcomeId?: string) => void;
}> = ({ market, onPick }) => {
  const { isSelected } = useBetSlip();
  const probability = market.outcomes[0]?.probability ?? null;
  const pct = probability === null ? null : Math.round(probability * 100);
  const yesId = market.outcomes[0]?.id;
  const noId = market.outcomes[1]?.id;
  const yesInSlip = yesId !== undefined && isSelected(market.id, yesId);
  const noInSlip = noId !== undefined && isSelected(market.id, noId);

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col">
        {pct === null ? (
          <span
            className="text-2xl font-mono font-extrabold text-neutral-600 leading-none"
            title="Sin cotización ahora mismo"
          >
            —
          </span>
        ) : (
          <span className="text-2xl font-mono font-extrabold text-neutral-100 leading-none">
            {pct}
            <span className="text-sm">%</span>
          </span>
        )}
        <span className="text-[10px] font-mono uppercase text-neutral-500 mt-0.5">
          {pct === null ? 'sin cotización' : 'probabilidad'}
        </span>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-2">
        <button
          onClick={() => onPick(market, yesId)}
          className={`py-2 rounded-lg border text-[11px] font-bold text-emerald-300 transition-all active:scale-95 truncate px-1 ${
            yesInSlip
              ? 'bg-emerald-500/30 border-emerald-400 ring-1 ring-emerald-400/50'
              : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25'
          }`}
          title={yesInSlip ? 'En el boleto — clic para quitar' : 'Añadir al boleto'}
        >
          {market.outcomes[0] !== undefined
            ? translateOutcomeLabel(market.outcomes[0].label)
            : 'Sí'}
        </button>
        <button
          onClick={() => onPick(market, noId)}
          className={`py-2 rounded-lg border text-[11px] font-bold text-rose-300 transition-all active:scale-95 truncate px-1 ${
            noInSlip
              ? 'bg-rose-500/30 border-rose-400 ring-1 ring-rose-400/50'
              : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/25'
          }`}
          title={noInSlip ? 'En el boleto — clic para quitar' : 'Añadir al boleto'}
        >
          {market.outcomes[1] !== undefined
            ? translateOutcomeLabel(market.outcomes[1].label)
            : 'No'}
        </button>
      </div>
    </div>
  );
};

/**
 * Una opción dentro de un evento multi-mercado. En venues de cuota decimal se
 * enseña la cuota en grande y el % atenuado. Sin cotización se muestra una
 * raya: pintar 0% o 50% sería inventarlo.
 */
const OptionRow: React.FC<{
  market: Market;
  /** Etiqueta ya desambiguada por la lista; sin ella, la del mercado. */
  label?: string;
  prediction?: boolean;
  onPick: () => void;
}> = ({ market, label, prediction = false, onPick }) => {
  const outcome = market.outcomes[0];
  const probability = outcome?.probability ?? null;
  const pct = probability === null ? null : Math.round(probability * 100);
  const display = outcomeDisplay(
    outcome?.price ?? null,
    probability,
    market.priceFormat,
  );

  return (
    <button
      onClick={onPick}
      className={`group w-full flex items-center gap-2.5 text-left transition-all ${
        prediction
          ? 'w-full px-1 py-3 transition-colors hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#83d9ce]'
          : '-mx-2 rounded-lg px-2 py-1.5 hover:bg-neutral-800/50'
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`truncate ${prediction ? 'text-[12px] font-medium text-[#d8e1e5]' : 'text-[11.5px] text-neutral-300'}`}>
          {label ?? optionLabelOf(market)}
        </span>

        {/* El largo de la barra solo representa una probabilidad publicada. */}
        <span className={`h-0.5 rounded-full bg-neutral-800 overflow-hidden shrink-0 ${prediction ? 'w-full' : 'hidden w-14 sm:block'}`}>
          {pct !== null && (
            <span
              className={`block h-full transition-colors ${prediction ? 'bg-[#83d9ce]/75 group-hover:bg-[#b9f0e7]' : 'bg-sky-300/65 group-hover:bg-sky-200'}`}
              style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
            />
          )}
        </span>
      </span>

      {display.secondary !== null && (
        <span className={`font-mono text-neutral-600 text-right shrink-0 ${prediction ? 'text-[10px]' : 'w-8 text-[10px]'}`}>
          {display.secondary}
        </span>
      )}
      <span
        className={`font-mono font-bold text-right shrink-0 ${prediction ? 'w-14 text-[13px]' : 'w-10 text-[11.5px]'} ${
          display.primary === null ? 'text-neutral-600' : 'text-neutral-100'
        }`}
        title={display.primary === null ? 'Sin cotización ahora mismo' : undefined}
      >
        {display.primary ?? '—'}
      </span>
    </button>
  );
};
