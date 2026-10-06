import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WithdrawalAccess } from '../WithdrawalAccess';
const state = vi.hoisted(() => ({ address: null as string | null, balance: 5_000_000n as bigint | null, loading: false }));
vi.mock('../../services/web3Service', () => ({ useWallet: () => ({ address: state.address }) }));
vi.mock('../../services/marketSources', () => ({ balanceWithdrawal: { pending: () => null } }));
vi.mock('../../hooks/useVenueBalances', () => ({ useVenueBalances: () => ({ isLoading: state.loading, refetch: vi.fn(), balances: [
  { venue: 'azuro', symbol: 'USDT', chainId: 137, decimals: 6, rawBalance: state.balance },
] }) }));
const render = (open = true) => renderToStaticMarkup(createElement(WithdrawalAccess, { open, onToggle: vi.fn() }));
describe('retiro general independiente de tickets', () => {
  beforeEach(() => { state.address = null; state.balance = 5_000_000n; state.loading = false; });
  it('mantiene el acceso visible sin wallet', () => {
    expect(render(false)).toContain('Retirar fondos a mi wallet');
    expect(render()).toContain('Conecta tu wallet');
  });
  it('muestra saldo, dirección y monto sin consultar premios', () => {
    state.address = '0x1111111111111111111111111111111111111111';
    const html = render();
    expect(html).toContain('Saldo disponible: 5 USDT');
    expect(html).toContain('Dirección de destino');
    expect(html).toContain('Monto a retirar');
    expect(html).not.toContain('tickets');
    expect(html).toContain('Polygon');
  });
  it('no inventa un saldo al fallar la consulta', () => {
    state.address = '0x1111111111111111111111111111111111111111'; state.balance = null;
    expect(render()).toContain('Saldo no disponible');
    state.loading = true;
    expect(render()).toContain('Consultando saldo');
  });
});
