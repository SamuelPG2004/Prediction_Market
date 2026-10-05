import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WithdrawalAccess } from '../WithdrawalAccess';

const base = { open: false, connected: false, loading: false, readError: false,
  availableCount: 0, recipient: '', onToggle: vi.fn(), onRecipientChange: vi.fn() };
const render = (props: Partial<Parameters<typeof WithdrawalAccess>[0]> = {}) =>
  renderToStaticMarkup(createElement(WithdrawalAccess, { ...base, ...props }));
describe('acceso visible al retiro', () => {
  it('mantiene el botón visible sin wallet ni premios', () => {
    const html = render();
    expect(html).toContain('Retirar a mi wallet');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('disabled');
  });
  it('muestra el campo de dirección y el motivo cuando no hay wallet', () => {
    const html = render({ open: true });
    expect(html).toContain('Dirección de destino');
    expect(html).toContain('Conecta tu wallet');
  });
  it('explica que no hay premios disponibles sin ocultar el formulario', () => {
    const html = render({ open: true, connected: true });
    expect(html).toContain('Todavía no hay premios disponibles');
    expect(html).toContain('Dirección de destino');
  });
  it('distingue carga, errores y tickets disponibles', () => {
    expect(render({ open: true, connected: true, loading: true })).toContain('Consultando premios');
    expect(render({ open: true, connected: true, readError: true })).toContain('No pudimos consultar');
    expect(render({ open: true, connected: true, availableCount: 2 })).toContain('Tienes 2 premios disponibles');
  });
  it('señala un destino inválido', () => {
    expect(render({ open: true, connected: true, recipient: 'incorrecto' })).toContain('dirección EVM válida');
  });
});
