import React, { useState } from 'react';
import { Activity, Droplets, MessageSquare, Radio } from 'lucide-react';
import type { RealEvent, RealMarket } from '../services/gammaApi';
import { formatCompactNumber } from '../utils/formatters';

/** Cuántas opciones se listan antes de resumir el resto. */
const MAX_VISIBLE_OPTIONS = 4;

interface EventCardProps {
  event: RealEvent;
  /** Abre el panel de operación en un mercado concreto del evento. */
  onSelectMarket: (event: RealEvent, market: RealMarket) => void;
  /**
   * Carga la imagen con prioridad. Se usa en las primeras tarjetas: con `lazy`
   * en todas, la parte visible aparece sin imágenes durante un instante.
   */
  eagerImage?: boolean;
}

/**
 * Tarjeta de evento, al estilo de Polymarket.
 *
 * Dos presentaciones según la forma del evento:
 *  - binario (un solo mercado Sí/No): porcentaje grande y botones Sí/No.
 *  - multi-opción: lista de opciones con su probabilidad y un botón por fila.
 *
 * La etiqueta de cada opción sale de `groupItemTitle` ("25 bps decrease",
 * "Real Madrid CF"), no de la pregunta completa, que en estos eventos es
 * repetitiva e ilegible.
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

  return (
    <div className="group rounded-2xl bg-[#0d1017] border border-neutral-800/80 hover:border-neutral-700 transition-colors p-4 flex flex-col gap-3">
      {/* Cabecera: imagen oficial + título + insignias */}
      <div className="flex items-start gap-3">
        <EventImage event={event} eager={eagerImage} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {event.live && (
              <Badge tone="live">
                <Radio className="w-2.5 h-2.5" />
                En vivo
              </Badge>
            )}
            {event.isNew && <Badge tone="new">Nuevo</Badge>}
            {event.featured && <Badge tone="featured">Destacado</Badge>}
            {event.hasNegRisk && <Badge tone="neg">negRisk</Badge>}
          </div>

          <h3 className="text-[13px] font-semibold text-neutral-100 leading-snug line-clamp-2 group-hover:text-white">
            {event.title}
          </h3>
        </div>
      </div>

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

      {/* Pie: métricas reales */}
      <div className="flex items-center gap-3.5 text-[10px] font-mono text-neutral-500 border-t border-neutral-800/60 pt-2.5 mt-auto">
        <span className="flex items-center gap-1" title="Liquidez del evento">
          <Droplets className="w-3 h-3" />$
          {formatCompactNumber(event.liquidityUsd)}
        </span>
        <span className="flex items-center gap-1" title="Volumen 24h">
          <Activity className="w-3 h-3" />$
          {formatCompactNumber(event.volume24hUsd)}
        </span>
        {event.commentCount > 0 && (
          <span className="flex items-center gap-1" title="Comentarios">
            <MessageSquare className="w-3 h-3" />
            {formatCompactNumber(event.commentCount)}
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
 * Imagen del evento con reserva.
 *
 * Las imágenes vienen del S3 de Polymarket, así que pueden fallar o tardar.
 * Si no carga se muestra la inicial del título en vez de un hueco roto.
 */
const EventImage: React.FC<{ event: RealEvent; eager?: boolean }> = ({
  event,
  eager,
}) => {
  const [failed, setFailed] = useState(false);
  const src = event.icon ?? event.image;

  if (!src || failed) {
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
      src={src}
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

/** Evento binario: probabilidad grande y compra directa de Sí/No. */
const BinaryBody: React.FC<{
  market: RealMarket;
  onPick: (m: RealMarket) => void;
}> = ({ market, onPick }) => {
  const yesPct = Math.round((market.prices[0] ?? 0.5) * 100);

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col">
        <span className="text-2xl font-mono font-extrabold text-neutral-100 leading-none">
          {yesPct}
          <span className="text-sm">%</span>
        </span>
        <span className="text-[10px] font-mono uppercase text-neutral-500 mt-0.5">
          probabilidad
        </span>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-2">
        <button
          onClick={() => onPick(market)}
          className="py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-[11px] font-bold text-emerald-300 transition-all active:scale-95"
        >
          {market.outcomes[0] ?? 'Sí'}
        </button>
        <button
          onClick={() => onPick(market)}
          className="py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-[11px] font-bold text-rose-300 transition-all active:scale-95"
        >
          {market.outcomes[1] ?? 'No'}
        </button>
      </div>
    </div>
  );
};

/** Una opción dentro de un evento multi-mercado. */
const OptionRow: React.FC<{
  market: RealMarket;
  onPick: () => void;
}> = ({ market, onPick }) => {
  const pct = Math.round((market.prices[0] ?? 0) * 100);
  const label = market.optionLabel ?? market.question;

  return (
    <button
      onClick={onPick}
      className="w-full flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg hover:bg-neutral-800/50 transition-colors text-left"
    >
      <span className="flex-1 text-[11.5px] text-neutral-300 truncate">
        {label}
      </span>

      {/* Barra de probabilidad, compacta */}
      <span className="w-14 h-1 rounded-full bg-neutral-800 overflow-hidden shrink-0 hidden sm:block">
        <span
          className="block h-full bg-neutral-500 group-hover:bg-emerald-500/70 transition-colors"
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </span>

      <span className="text-[11.5px] font-mono font-bold text-neutral-100 w-9 text-right shrink-0">
        {pct}%
      </span>
    </button>
  );
};

const Badge: React.FC<{
  tone: 'live' | 'new' | 'featured' | 'neg';
  children: React.ReactNode;
}> = ({ tone, children }) => {
  const tones: Record<typeof tone, string> = {
    live: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    new: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    featured: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    neg: 'bg-violet-500/10 text-violet-400/90 border-violet-500/25',
  };
  return (
    <span
      className={`flex items-center gap-0.5 text-[9px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${tones[tone]}`}
    >
      {children}
    </span>
  );
};
