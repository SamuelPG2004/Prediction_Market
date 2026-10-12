import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toDecimal, type Market } from '../../domain/types';
import { SportsMarketPreview } from '../SportsMarketPreview';
import type { MarketEventView } from '../../utils/eventGrouping';
function fixture(label: string, available = true): MarketEventView {
  const market: Market = { id: 'test:1', venue: 'test', chainId: 137, category: 'sports', status: 'open', question: label,
    isQuotable: available, priceFormat: 'decimal-odds', liquidityUsd: null, volume24hUsd: null, closesAt: null,
    outcomes: [{ id: '1', label: 'Local', price: available ? toDecimal('1.85') : null, probability: available ? 0.54 : null, isQuotable: available },
      { id: '2', label: 'Visitante', price: available ? toDecimal('2.10') : null, probability: available ? 0.48 : null, isQuotable: available }] };
  return { id: 'game', title: 'Local - Visitante', markets: [market], participants: [{ name: 'Local' }, { name: 'Visitante' }], isBinary: false,
    isLive: false, liquidityUsd: null, volume24hUsd: null, totalVolumeUsd: null };
}
describe('vista previa de mercados deportivos', () => {
  it('muestra ambas cuotas en destacados aunque el título no sea Match Winner', () => {
    const html = renderToStaticMarkup(createElement(SportsMarketPreview, { event: fixture('Match Result'), compact: true, onSelectMarket: vi.fn() }));
    expect(html).toContain('1.85'); expect(html).toContain('2.10'); expect(html).toContain('Resultado del partido');
    expect(html).toContain('Todos los mercados');
  });
  it('explica cuotas no disponibles en vez de dejar una tarjeta vacía', () => {
    const html = renderToStaticMarkup(createElement(SportsMarketPreview, { event: fixture('Match Result', false), onSelectMarket: vi.fn() }));
    expect(html).toContain('Cuotas no disponibles'); expect(html).toContain('disabled'); expect(html).not.toContain('0%');
  });
  it('deja visibles todos los lados del mercado', () => {
    const event = fixture('Match Result');
    event.markets[0].outcomes.splice(1, 0, { id: 'draw', label: 'Draw', price: toDecimal('3.20'), probability: 0.31, isQuotable: true });
    const html = renderToStaticMarkup(createElement(SportsMarketPreview, { event, onSelectMarket: vi.fn() }));
    expect(html).toContain('Empate'); expect(html).toContain('3.20'); expect(html).toContain('Visitante');
  });
});
