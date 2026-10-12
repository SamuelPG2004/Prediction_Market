import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StarMarketRow } from '../EventCard';
import { toDecimal, type Market } from '../../domain/types';
import { useBetSlipStore } from '../../hooks/useBetSlip';
// El render de servidor usa getInitialState; simula la selección del cliente.
vi.mock('../../hooks/useBetSlip', async importOriginal => {
  const actual = await importOriginal<typeof import('../../hooks/useBetSlip')>();
  return { ...actual, useBetSlip: () => ({ isSelected: (marketId: string, outcomeId: string) =>
    actual.useBetSlipStore.getState().selections.some(s => s.market.id === marketId && s.outcomeId === outcomeId) }) };
});
const market: Market = { id: 'test:match', venue: 'test', chainId: 137, question: 'Ganador', category: 'sports', status: 'open',
  closesAt: null, liquidityUsd: null, volume24hUsd: null, isQuotable: true, priceFormat: 'decimal-odds', outcomes: [
    { id: 'home', label: 'Local', price: toDecimal('1.85'), probability: 0.54, isQuotable: true },
    { id: 'away', label: 'Visitante', price: toDecimal('2.10'), probability: 0.47, isQuotable: true },
  ] };
const render = (value = market) => renderToStaticMarkup(createElement(StarMarketRow, { market: value, hideLabel: true, onPick: vi.fn() }));
describe('presentación de cuotas', () => {
  beforeEach(() => useBetSlipStore.setState({ selections: [], isOpen: false }));
  it('identifica el resultado y su cuota para lectores de pantalla', () => {
    expect(render()).toContain('aria-label="Local · 1.85"');
    expect(render()).toContain('aria-pressed="false"');
  });
  it('marca la selección existente sin emitir operaciones', () => {
    useBetSlipStore.setState({ selections: [{ market, outcomeId: 'home', eventTitle: 'Partido' }] });
    expect(render()).toContain('aria-pressed="true"');
    expect(useBetSlipStore.getState().selections).toHaveLength(1);
  });
  it('deshabilita cuotas ausentes y muestra una raya', () => {
    const html = render({ ...market, outcomes: market.outcomes.map(o => ({ ...o, price: null, probability: null, isQuotable: false })) });
    expect(html).toContain('disabled');
    expect(html).toContain('sin cotización');
    expect(html).toContain('—');
    expect(html).not.toContain('0%');
  });
});
