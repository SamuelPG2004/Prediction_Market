import React, { useState } from 'react';
import { Activity, Droplets } from 'lucide-react';
import type { Market } from '../domain/types';
import { optionLabelOf, type MarketEventView } from '../utils/eventGrouping';
import { formatCompactNumber } from '../utils/formatters';

/** Cuántas opciones se listan antes de resumir el resto. */
const MAX_VISIBLE_OPTIONS = 4;

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
 * Dos presentaciones según la forma del evento:
 *  - binario (un solo mercado de dos resultados): porcentaje grande y un botón
 *    por resultado.
 *  - multi-mercado: lista de opciones con su probabilidad.
 *
 * Un resultado sin cotización se muestra como "—", jamás como 0%.
 */
export const EventCard: React.FC<EventCardProps> = ({
  event,
  onSelectMarket,
  eagerImage = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  const visibleMarkets = expanded
    ? event.markets
    : event.markets.slice(0, MAX_VISIBLE_OPTIONS);
  const hiddenCount = event.markets.length - visibleMarkets.length;

  /** Clic en la cabecera: abre el panel en el primer mercado cotizable. */
  const openEvent = () => {
    const target =
      event.markets.find((m) => m.isQuotable) ?? event.markets[0];
    if (target !== undefined) onSelectMarket(event, target);
  };

  return (
    <div className="group rounded-2xl bg-[#0d1017] border border-neutral-800/80 hover:border-neutral-700 transition-colors p-4 flex flex-col gap-3">
      {/* Cabecera: imagen + título. Clicable: abre el panel de operación. */}
      <button
        onClick={openEvent}
        className="flex items-start gap-3 text-left cursor-pointer"
        title="Abrir este evento"
      >
        <EventImage event={event} eager={eagerImage} />

        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-neutral-100 leading-snug line-clamp-2 group-hover:text-white">
            {event.title}
          </h3>
          {event.markets[0]?.subcategory !== undefined && (
            <span className="text-[10px] font-mono uppercase tracking-wide text-neutral-500">
              {event.markets[0].subcategory}
            </span>
          )}
        </div>
      </button>

      {/* Cuerpo: binario o lista de opciones */}
      {event.isBinary ? (
        <BinaryBody
          market={event.markets[0]}
          onPick={(m) => onSelectMarket(event, m)}
        />
      ) : (
        <div className="flex flex-col gap-1">
          {visibleMarkets.map((m) => (
            <OptionRow
              key={m.id}
              market={m}
              onPick={() => onSelectMarket(event, m)}
            />
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
        {event.markets[0]?.closesAt != null && (
          <span title="Cierre">
            {event.markets[0].closesAt.toLocaleString(undefined, {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
        <span className="ml-auto text-neutral-600">
          {event.markets.length}{' '}
          {event.markets.length === 1 ? 'mercado' : 'mercados'}
        </span>
      </div>
    </div>
  );
};

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
 * Una opción dentro de un evento multi-mercado. Sin cotización se muestra una
 * raya: pintar 0% o 50% sería inventarlo.
 */
const OptionRow: React.FC<{
  market: Market;
  onPick: () => void;
}> = ({ market, onPick }) => {
  const probability = market.outcomes[0]?.probability ?? null;
  const pct = probability === null ? null : Math.round(probability * 100);

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

      <span
        className={`text-[11.5px] font-mono font-bold w-9 text-right shrink-0 ${
          pct === null ? 'text-neutral-600' : 'text-neutral-100'
        }`}
        title={pct === null ? 'Sin cotización ahora mismo' : undefined}
      >
        {pct === null ? '—' : `${pct}%`}
      </span>
    </button>
  );
};
