import React, { useState } from 'react';
import { Activity, Droplets } from 'lucide-react';
import type { Market } from '../domain/types';
import { optionLabelOf, type MarketEventView } from '../utils/eventGrouping';
import { formatCompactNumber, formatEventDate } from '../utils/formatters';
import { subcategoryIcon, subcategoryLabel } from '../utils/subcategories';

/** Cuántas opciones se listan antes de resumir el resto. */
const MAX_VISIBLE_OPTIONS = 4;

/**
 * Mercados "estrella" de un enfrentamiento, por orden de preferencia: el
 * ganador del partido es lo primero que busca quien mira la tarjeta. El resto
 * de mercados (hándicaps, totales…) se opera desde el panel.
 */
const STAR_MARKET_PATTERNS = [
  /^full time result$/i,
  /^match winner$/i,
  /^1x2$/i,
  /^winner$/i,
  /^money ?line$/i,
];

interface EventCardProps {
  event: MarketEventView;
  /** Abre el panel de operación en un mercado concreto del evento. */
  onSelectMarket: (event: MarketEventView, market: Market) => void;
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

  /** Clic en la cabecera: abre el panel en el primer mercado cotizable. */
  const openEvent = () => {
    const target =
      event.markets.find((m) => m.isQuotable) ?? event.markets[0];
    if (target !== undefined) onSelectMarket(event, target);
  };

  return (
    <div className="group rounded-2xl bg-[#0d1017] border border-neutral-800/80 hover:border-neutral-700 transition-colors p-4 flex flex-col gap-3">
      {isMatchup ? (
        <MatchupBody event={event} eagerImage={eagerImage} onOpen={openEvent} onSelectMarket={onSelectMarket} />
      ) : (
        <GenericBody event={event} eagerImage={eagerImage} onOpen={openEvent} onSelectMarket={onSelectMarket} />
      )}

      {/* Pie: métricas. Las que el venue no aporta no se inventan: se omiten. */}
      <div className="flex items-center gap-3.5 text-[10px] font-mono text-neutral-500 border-t border-neutral-800/60 pt-2.5 mt-auto">
        {event.liquidityUsd !== null && (
          <span className="flex items-center gap-1" title="Liquidez">
            <Droplets className="w-3 h-3" />$
            {formatCompactNumber(event.liquidityUsd)}
          </span>
        )}
        {event.volume24hUsd !== null && (
          <span className="flex items-center gap-1" title="Volumen 24h">
            <Activity className="w-3 h-3" />$
            {formatCompactNumber(event.volume24hUsd)}
          </span>
        )}
        {event.isLive ? (
          <span className="text-rose-400" title="En juego ahora mismo">
            En juego
          </span>
        ) : (
          event.markets[0]?.closesAt != null && (
            <span title="Comienzo">
              {formatEventDate(event.markets[0].closesAt)}
            </span>
          )
        )}
        <span className="ml-auto text-neutral-600">
          {event.markets.length}{' '}
          {event.markets.length === 1 ? 'mercado' : 'mercados'}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Presentación "enfrentamiento": escudos, liga y mercado estrella
// ---------------------------------------------------------------------------

/** El mercado ganador del partido, si el evento lo tiene y cotiza. */
function findStarMarket(markets: Market[]): Market | null {
  if (markets.length === 1) return markets[0];
  for (const pattern of STAR_MARKET_PATTERNS) {
    const candidates = markets.filter((m) => pattern.test(optionLabelOf(m)));
    const best = candidates.find((m) => m.isQuotable) ?? candidates[0];
    if (best !== undefined) return best;
  }
  return null;
}

const MatchupBody: React.FC<{
  event: MarketEventView;
  eagerImage: boolean;
  onOpen: () => void;
  onSelectMarket: (event: MarketEventView, market: Market) => void;
}> = ({ event, eagerImage, onOpen, onSelectMarket }) => {
  const [a, b] = event.participants!;
  const star = findStarMarket(event.markets);
  const restCount = event.markets.length - (star !== null ? 1 : 0);

  return (
    <>
      {/* Liga y estado en vivo */}
      <div className="flex items-center justify-between gap-2">
        <ContextLine
          subcategory={event.markets[0]?.subcategory}
          leagueName={event.leagueName}
        />
        {event.isLive && <LiveBadge />}
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

      {/* Mercado estrella con cuotas; el resto vive en el panel. */}
      {star !== null ? (
        <StarMarketRow
          market={star}
          participants={event.participants}
          onPick={() => onSelectMarket(event, star)}
        />
      ) : (
        <OptionList event={event} onSelectMarket={onSelectMarket} />
      )}

      {star !== null && restCount > 0 && (
        <button
          onClick={onOpen}
          className="py-1.5 text-[11px] font-semibold text-neutral-500 hover:text-emerald-300 transition-colors"
        >
          Ver los {event.markets.length} mercados →
        </button>
      )}
    </>
  );
};

const ParticipantColumn: React.FC<{
  participant: { name: string; imageUrl?: string };
  eager: boolean;
}> = ({ participant, eager }) => (
  <span className="flex flex-col items-center gap-1.5 min-w-0">
    <ParticipantLogo participant={participant} eager={eager} />
    <span className="text-[11px] font-semibold text-neutral-100 text-center leading-tight line-clamp-2">
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

/** ¿Es este resultado el empate? (etiqueta del venue, sin normalizar). */
function isDrawOutcome(label: string): boolean {
  return /^(draw|empate|x)$/i.test(label.trim());
}

/**
 * El mercado principal del enfrentamiento: un botón por resultado con la cuota
 * grande y la probabilidad pequeña. Sin cotización: raya, nunca 0%.
 *
 * El orden de los botones sigue a la cabecera: local · (empate) · visitante,
 * casando cada resultado con su participante, aunque el venue publique otro
 * orden.
 */
const StarMarketRow: React.FC<{
  market: Market;
  participants?: { name: string; imageUrl?: string }[];
  onPick: () => void;
}> = ({ market, participants, onPick }) => {
  let outcomes = market.outcomes.slice(0, 3);
  const draw = outcomes.find((o) => isDrawOutcome(o.label));
  const byName = (name: string) =>
    outcomes.find(
      (o) => o.label.trim().toLowerCase() === name.trim().toLowerCase(),
    );
  const home = participants?.[0] !== undefined ? byName(participants[0].name) : undefined;
  const away = participants?.[1] !== undefined ? byName(participants[1].name) : undefined;
  if (home !== undefined && away !== undefined && home !== away) {
    outcomes = [home, ...(draw !== undefined ? [draw] : []), away];
  } else if (outcomes.length === 3 && draw !== undefined) {
    const rest = outcomes.filter((o) => o !== draw);
    outcomes = [rest[0], draw, rest[1]];
  }

  return (
  <div className="flex flex-col gap-1.5">
    <span className="text-[9px] uppercase font-mono text-neutral-600 tracking-wider">
      {optionLabelOf(market)}
    </span>
    <div
      className={`grid gap-2 ${
        outcomes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
      }`}
    >
      {outcomes.map((o) => {
        const display = outcomeDisplay(o.price, o.probability, market.priceFormat);
        return (
          <button
            key={o.id}
            onClick={onPick}
            className="py-1.5 px-1 rounded-lg bg-emerald-500/[0.07] hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 transition-all active:scale-95 flex flex-col items-center min-w-0"
            title={display.primary === null ? 'Sin cotización ahora mismo' : undefined}
          >
            <span className="text-[10px] text-neutral-400 truncate w-full text-center">
              {isDrawOutcome(o.label) ? 'Empate' : o.label}
            </span>
            <span
              className={`font-mono font-extrabold text-[15px] leading-tight ${
                display.primary === null ? 'text-neutral-600' : 'text-emerald-300'
              }`}
            >
              {display.primary ?? '—'}
            </span>
            {display.secondary !== null && (
              <span className="text-[9px] font-mono text-neutral-500">
                {display.secondary}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
  );
};

// ---------------------------------------------------------------------------
// Presentación genérica (binaria o lista de opciones)
// ---------------------------------------------------------------------------

const GenericBody: React.FC<{
  event: MarketEventView;
  eagerImage: boolean;
  onOpen: () => void;
  onSelectMarket: (event: MarketEventView, market: Market) => void;
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
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-neutral-100 leading-snug line-clamp-2 group-hover:text-white flex-1">
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
        onPick={(m) => onSelectMarket(event, m)}
      />
    ) : (
      <OptionList event={event} onSelectMarket={onSelectMarket} />
    )}
  </>
);

/** Lista de opciones con expandir/plegar, común a varias presentaciones. */
const OptionList: React.FC<{
  event: MarketEventView;
  onSelectMarket: (event: MarketEventView, market: Market) => void;
}> = ({ event, onSelectMarket }) => {
  const [expanded, setExpanded] = useState(false);

  const visibleMarkets = expanded
    ? event.markets
    : event.markets.slice(0, MAX_VISIBLE_OPTIONS);
  const hiddenCount = event.markets.length - visibleMarkets.length;

  return (
    <div className="flex flex-col gap-1">
      {visibleMarkets.map((m) => (
        <OptionRow key={m.id} market={m} onPick={() => onSelectMarket(event, m)} />
      ))}

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-0.5 py-1.5 text-[11px] font-semibold text-neutral-500 hover:text-neutral-300 transition-colors text-left"
        >
          + {hiddenCount} opciones más
        </button>
      )}
      {expanded && event.markets.length > MAX_VISIBLE_OPTIONS && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-0.5 py-1.5 text-[11px] font-semibold text-neutral-500 hover:text-neutral-300 transition-colors text-left"
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
    <span className="text-[10px] text-neutral-500 truncate flex items-center gap-1 min-w-0">
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
function outcomeDisplay(
  price: Market['outcomes'][number]['price'],
  probability: number | null,
  priceFormat: Market['priceFormat'],
): { primary: string | null; secondary: string | null } {
  const pct = probability === null ? null : `${Math.round(probability * 100)}%`;
  if (priceFormat === 'decimal-odds') {
    const odds = price === null ? null : Number(price).toFixed(2);
    return { primary: odds, secondary: odds === null ? null : pct };
  }
  return { primary: pct, secondary: null };
}

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
  onPick: (m: Market) => void;
}> = ({ market, onPick }) => {
  const probability = market.outcomes[0]?.probability ?? null;
  const pct = probability === null ? null : Math.round(probability * 100);

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
          onClick={() => onPick(market)}
          className="py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-[11px] font-bold text-emerald-300 transition-all active:scale-95 truncate px-1"
        >
          {market.outcomes[0]?.label ?? 'Sí'}
        </button>
        <button
          onClick={() => onPick(market)}
          className="py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-[11px] font-bold text-rose-300 transition-all active:scale-95 truncate px-1"
        >
          {market.outcomes[1]?.label ?? 'No'}
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
  onPick: () => void;
}> = ({ market, onPick }) => {
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
      className="w-full flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg hover:bg-neutral-800/50 transition-colors text-left"
    >
      <span className="flex-1 text-[11.5px] text-neutral-300 truncate">
        {optionLabelOf(market)}
      </span>

      {/* Barra de probabilidad, compacta. Sin precio no se dibuja. */}
      <span className="w-14 h-1 rounded-full bg-neutral-800 overflow-hidden shrink-0 hidden sm:block">
        {pct !== null && (
          <span
            className="block h-full bg-neutral-500 group-hover:bg-emerald-500/70 transition-colors"
            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
          />
        )}
      </span>

      {display.secondary !== null && (
        <span className="text-[10px] font-mono text-neutral-600 w-8 text-right shrink-0">
          {display.secondary}
        </span>
      )}
      <span
        className={`text-[11.5px] font-mono font-bold w-10 text-right shrink-0 ${
          display.primary === null ? 'text-neutral-600' : 'text-neutral-100'
        }`}
        title={display.primary === null ? 'Sin cotización ahora mismo' : undefined}
      >
        {display.primary ?? '—'}
      </span>
    </button>
  );
};
