import { useMemo, useState } from 'react';
import type { Market } from '../domain/types';
import { marketLineOf, marketVariantLabelOf, optionLabelOf, type MarketEventView } from '../utils/eventGrouping';
import { displaySportsMarket, sortedSportsGroups, SPORTS_MARKET_CATEGORIES, sportsMarketCategory } from '../utils/sportsMarkets';
import { useBetSlip } from '../hooks/useBetSlip';
import { favoritePriceOf, orderedStarOutcomes, StarOutcomeButton } from './MarketOdds';
import type { SelectMarketHandler } from './EventCard';

/** Mercados reales del evento: categoría → línea → resultado exacto. */
export function SportsMarketPreview({ event, onSelectMarket, compact = false }: {
  event: MarketEventView; onSelectMarket: SelectMarketHandler; compact?: boolean;
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const { isSelected } = useBetSlip();
  const groups = useMemo(() => sortedSportsGroups(event.markets), [event.markets]);
  const market = event.markets.find(m => m.id === chosenId) ?? displaySportsMarket(event.markets);
  const category = market ? sportsMarketCategory(market) : null;
  const categories = SPORTS_MARKET_CATEGORIES.filter(c => groups.some(g => sportsMarketCategory(g.markets[0]) === c.id));
  const options = groups.filter(g => sportsMarketCategory(g.markets[0]) === category).flatMap(g => g.markets);
  const open = () => { if (market) onSelectMarket(event, market); };
  if (!market) return <p className="text-xs text-neutral-400">No hay mercados disponibles.</p>;
  const outcomes = market.outcomes.length <= 3 ? orderedStarOutcomes(market, event.participants) : market.outcomes;
  const favorite = favoritePriceOf(outcomes, market.priceFormat);
  const label = (m: Market) => {
    const line = marketLineOf(m);
    return `${optionLabelOf(m)}${line !== null ? ` · ${marketVariantLabelOf(m)}` : ''}`;
  };
  return <div className="flex flex-col gap-2.5 min-w-0">
    {!compact && categories.length > 1 && <div role="group" aria-label="Tipos de mercado" className="flex gap-1.5 overflow-x-auto pb-1">
      {categories.map(c => <button type="button" key={c.id} aria-pressed={category === c.id}
        onClick={() => { const candidates = groups.filter(g => sportsMarketCategory(g.markets[0]) === c.id).flatMap(g => g.markets);
          setChosenId((candidates.find(m => m.isQuotable) ?? candidates[0]).id); }}
        className={`shrink-0 rounded-lg px-2.5 py-2 text-[10px] font-bold transition-colors ${category === c.id ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/25' : 'border border-white/[0.06] bg-white/[0.03] text-neutral-400 hover:text-white'}`}>
        {c.label}
      </button>)}
    </div>}
    {!compact && options.length > 1 ? <label className="text-[10px] text-neutral-400">
      Mercado / línea
      <select aria-label={`Mercado de ${event.title}`} value={market.id} onChange={e => setChosenId(e.target.value)}
        className="mt-1 block w-full min-w-0 rounded-lg border border-white/[0.08] bg-[#191e28] p-2 text-xs text-neutral-200">
        {options.map(m => <option key={m.id} value={m.id}>{label(m)}</option>)}
      </select>
    </label> : <p className="text-[10px] font-semibold text-neutral-400 truncate" title={label(market)}>{label(market)}</p>}
    <div className={`grid gap-2 ${outcomes.length === 2 ? 'grid-cols-2' : outcomes.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
      {outcomes.slice(0, compact ? 3 : 6).map(o => <StarOutcomeButton key={o.id} outcome={o} priceFormat={market.priceFormat}
        isFavorite={o.price !== null && Number(o.price) === favorite} inSlip={isSelected(market.id, o.id)}
        onPick={() => onSelectMarket(event, market, o.id)} />)}
    </div>
    {!market.isQuotable && <p role="status" className="text-[10px] text-amber-300">Cuotas no disponibles para este mercado ahora.</p>}
    <button type="button" onClick={open} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-[11px] text-neutral-300 hover:border-emerald-500/30 hover:text-emerald-300">
      <span>Todos los mercados</span><span className="font-mono">{event.markets.length} →</span>
    </button>
  </div>;
}
