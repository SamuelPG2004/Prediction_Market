import React from 'react';
import type { Market } from '../domain/types';
import { optionLabelOf } from '../utils/eventGrouping';
import { translateOutcomeLabel } from '../utils/marketLabels';
import { useBetSlip } from '../hooks/useBetSlip';
import { usePriceFlash } from '../hooks/usePriceFlash';

/** ¿Es este resultado el empate? (etiqueta del venue, sin normalizar). */
function isDrawOutcome(label: string): boolean {
  return /^(draw|empate|x)$/i.test(label.trim());
}

/**
 * Resultados del mercado estrella en el orden de la cabecera: local ·
 * (empate) · visitante, casando cada resultado con su participante aunque el
 * venue publique otro orden.
 */
export function orderedStarOutcomes(
  market: Market,
  participants?: { name: string }[],
): Market['outcomes'] {
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
  return outcomes;
}

/**
 * Precio del favorito: la cuota más baja, solo si es única y TODOS los
 * resultados cotizan — con uno sin precio, el mínimo de los demás no dice
 * quién es el favorito. `null` si no hay favorito claro.
 */
export function favoritePriceOf(
  outcomes: Market['outcomes'],
  priceFormat: Market['priceFormat'],
): number | null {
  if (priceFormat !== 'decimal-odds') return null;
  const prices = outcomes.map((o) => (o.price === null ? null : Number(o.price)));
  const known = prices.filter((p): p is number => p !== null);
  if (known.length !== outcomes.length || known.length < 2) return null;
  const lowest = Math.min(...known);
  return known.filter((p) => p === lowest).length === 1 ? lowest : null;
}

/**
 * El mercado principal del enfrentamiento: un botón por resultado con la cuota
 * grande y la probabilidad pequeña. Sin cotización: raya, nunca 0%. Cada botón
 * entrega el `outcomeId` clicado para preseleccionarlo en el boleto.
 *
 * El orden de los botones sigue a la cabecera: local · (empate) · visitante,
 * casando cada resultado con su participante, aunque el venue publique otro
 * orden.
 */
export const StarMarketRow: React.FC<{
  market: Market;
  participants?: { name: string; imageUrl?: string }[];
  onPick: (outcomeId: string) => void;
  /** Oculta la etiqueta del mercado cuando el contexto ya la hace obvia
   * (cara a cara con los nombres en los propios botones). */
  hideLabel?: boolean;
}> = ({ market, participants, onPick, hideLabel = false }) => {
  const { isSelected } = useBetSlip();
  const outcomes = orderedStarOutcomes(market, participants);
  const favoritePrice = favoritePriceOf(outcomes, market.priceFormat);

  return (
  <div className="flex flex-col gap-1.5">
    {!hideLabel && (
      <span className="text-[9px] uppercase font-mono text-neutral-600 tracking-wider">
        {optionLabelOf(market)}
      </span>
    )}
    <div
      className={`grid gap-2 ${
        outcomes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
      }`}
    >
      {outcomes.map((o) => (
        <StarOutcomeButton
          key={o.id}
          outcome={o}
          priceFormat={market.priceFormat}
          isFavorite={o.price !== null && Number(o.price) === favoritePrice}
          inSlip={isSelected(market.id, o.id)}
          onPick={() => onPick(o.id)}
        />
      ))}
    </div>
    <ProbabilitySplitBar outcomes={outcomes} />
  </div>
  );
};

/**
 * Reparto de probabilidad implícita del mercado: un segmento por resultado en
 * el orden de los botones, con el favorito (probabilidad máxima única) en
 * esmeralda. Solo se pinta si TODOS los resultados cotizan; normaliza los
 * anchos para sumar 100 aunque las cuotas incluyan el margen del venue.
 */
const ProbabilitySplitBar: React.FC<{ outcomes: Market['outcomes'] }> = ({
  outcomes,
}) => {
  const probs = outcomes.map((o) => o.probability);
  if (outcomes.length < 2 || probs.some((p) => p === null)) return null;
  const known = probs as number[];
  const total = known.reduce((a, p) => a + p, 0);
  if (total <= 0) return null;
  const max = Math.max(...known);
  const isFavorite = (p: number) =>
    p === max && known.filter((q) => q === max).length === 1;

  return (
    <div
      className="flex h-1 rounded-full overflow-hidden gap-px"
      title={outcomes
        .map(
          (o, i) =>
            `${translateOutcomeLabel(o.label)} ${Math.round((known[i] / total) * 100)}%`,
        )
        .join(' · ')}
    >
      {known.map((p, i) => (
        <span
          key={outcomes[i].id}
          className={isFavorite(p) ? 'bg-emerald-400/80' : 'bg-neutral-700'}
          style={{ width: `${(p / total) * 100}%` }}
        />
      ))}
    </div>
  );
};

/**
 * Botón de cuota del mercado estrella. Destella cuando el refresco en vivo
 * mueve el precio (verde si la cuota sube, rojo si baja) y marca al favorito
 * con más presencia que a los demás.
 */
export const StarOutcomeButton: React.FC<{
  outcome: Market['outcomes'][number];
  priceFormat: Market['priceFormat'];
  isFavorite: boolean;
  inSlip: boolean;
  onPick: () => void;
  /** Solo la cuota, sin etiqueta ni %: para las filas del modo lista. */
  compact?: boolean;
}> = ({ outcome: o, priceFormat, isFavorite, inSlip, onPick, compact = false }) => {
  const display = outcomeDisplay(o.price, o.probability, priceFormat);
  const flash = usePriceFlash(o.price === null ? null : Number(o.price));

  const base = inSlip
    ? 'bg-emerald-400 border-emerald-300 ring-2 ring-emerald-400/20'
    : isFavorite
      ? 'bg-[#202830] hover:bg-[#293a3b] border-emerald-500/25 hover:border-emerald-400/60'
      : 'bg-[#20232d] hover:bg-[#2b323c] border-white/[0.06] hover:border-emerald-500/40';
  const flashRing =
    !inSlip && flash === 'up'
      ? 'ring-1 ring-emerald-300/70'
      : !inSlip && flash === 'down'
        ? 'ring-1 ring-rose-400/70'
        : '';

  const label = translateOutcomeLabel(o.label);
  return (
    <button
      onClick={onPick}
      aria-pressed={inSlip}
      aria-label={`${label} · ${display.primary ?? 'sin cotización'}`}
      disabled={display.primary === null || !o.isQuotable}
      className={`${compact ? 'min-h-11 py-2 px-1' : 'min-h-16 py-2.5 px-2'} rounded-xl transition-colors active:scale-95 flex flex-col justify-center items-center min-w-0 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed ${base} ${flashRing}`}
      title={
        display.primary === null
          ? `${label} — sin cotización ahora mismo`
          : inSlip
            ? `${label} — en el boleto, clic para quitar`
            : isFavorite
              ? `${label} — favorito, añadir al boleto`
              : `${label} — añadir al boleto`
      }
    >
      {!compact && (
        <span className={`text-[11px] truncate w-full text-center ${inSlip ? 'text-emerald-950' : 'text-neutral-300'}`}>
          {label}
        </span>
      )}
      {/* En móvil las cuotas del modo lista van a ancho completo bajo el
          título y pierden la cabecera 1·X·2, así que la etiqueta viaja
          dentro del botón. En ≥sm la pone la cabecera de columnas. */}
      {compact && (
        <span className={`text-[10px] truncate w-full text-center ${inSlip ? 'text-emerald-950' : 'text-neutral-300'}`}>
          {label}
        </span>
      )}
      <span
        className={`font-mono font-extrabold tabular-nums ${compact ? 'text-sm' : 'text-lg'} leading-tight flex items-center gap-0.5 ${
          display.primary === null ? 'text-neutral-500' : inSlip ? 'text-emerald-950' : 'text-neutral-100'
        }`}
      >
        {display.primary ?? '—'}
        {/* Hueco SIEMPRE reservado: si la flecha aparece y desaparece, la
            cuota baila a cada destello. */}
        <span
          className={`w-2 shrink-0 text-[9px] ${
            flash === 'up' ? 'text-emerald-300' : 'text-rose-400'
          }`}
        >
          {flash === 'up' ? '▲' : flash === 'down' ? '▼' : ''}
        </span>
      </span>
      {!compact && display.secondary !== null && (
        <span className={`text-[10px] font-mono ${inSlip ? 'text-emerald-900/70' : 'text-neutral-400'}`}>
          {display.secondary}
        </span>
      )}
    </button>
  );
};


export function outcomeDisplay(
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
