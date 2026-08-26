import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Loader2,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Ban,
  Wallet,
} from 'lucide-react';
import type { RealEvent, RealMarket } from '../services/gammaApi';
import { roundToTick, simulateMarketFill } from '../services/clobApi';
import { useOrderBook } from '../hooks/useRealMarkets';
import { useClobTrading, type TradeSide } from '../hooks/useClobTrading';
import { useOnchainAccount, useShareBalances } from '../hooks/useOnchainAccount';
import { ApprovalsPanel } from './ApprovalsPanel';
import { PreflightChecklist } from './PreflightChecklist';
import { OpenOrdersPanel } from './OpenOrdersPanel';
import { txUrl } from '../config/polymarket';
import { formatCurrency } from '../utils/formatters';

interface RealTradePanelProps {
  /** Evento al que pertenece el mercado, para dar contexto y permitir cambiar de opcion. */
  event: RealEvent;
  /** Mercado (opcion) seleccionado inicialmente. */
  market: RealMarket;
  onClose: () => void;
  /** Abre el modal de conexión de wallet desde las comprobaciones previas. */
  onConnectWallet: () => void;
}

/**
 * Operativa real: libro en vivo, simulación de llenado y envío de la orden
 * firmada al CLOB.
 *
 * Todo lo que se muestra aquí sale de la cadena o del libro real. El precio de
 * la previsualización es el precio medio ponderado del recorrido por el libro,
 * no el mejor precio, para que no prometa algo que el mercado no va a dar.
 */
export const RealTradePanel: React.FC<RealTradePanelProps> = ({
  event,
  market: initialMarket,
  onClose,
  onConnectWallet,
}) => {
  // La opcion activa dentro del evento. Permite cambiar sin cerrar el panel.
  const [market, setMarket] = useState<RealMarket>(initialMarket);
  const [outcomeIndex, setOutcomeIndex] = useState(0);
  const [side, setSide] = useState<TradeSide>('buy');
  // Arranca en el mínimo del mercado: para una primera prueba real conviene
  // el importe más pequeño que el CLOB acepte, no una cifra redonda mayor.
  const [amount, setAmount] = useState('');
  const [useLimit, setUseLimit] = useState(true);
  const [limitPrice, setLimitPrice] = useState('');
  const [result, setResult] = useState<{
    ok: boolean;
    msg: string;
    orderId?: string;
    txHashes?: string[];
    blocked?: boolean;
  } | null>(null);

  const account = useOnchainAccount();
  const trading = useClobTrading();

  const tokenId = market?.clobTokenIds[outcomeIndex] ?? null;
  const { book, error: bookError } = useOrderBook(tokenId);
  const { balances } = useShareBalances(market?.clobTokenIds ?? []);

  useEffect(() => {
    setOutcomeIndex(0);
    setResult(null);
    // El mínimo lo fija el mercado (normalmente $5), así que se usa como
    // punto de partida en vez de un valor inventado.
    setAmount(market ? String(market.minOrderSize) : '');
  }, [market?.id, market?.minOrderSize]);

  // Precio de referencia del lado que toca
  const refPrice = side === 'buy' ? book?.bestAsk : book?.bestBid;

  useEffect(() => {
    if (refPrice && !limitPrice) setLimitPrice(String(refPrice));
  }, [refPrice, limitPrice]);

  const numericAmount = parseFloat(amount) || 0;
  const numericLimit = parseFloat(limitPrice) || 0;

  const fill = useMemo(() => {
    if (!book || !(numericAmount > 0)) return null;
    return simulateMarketFill(book, side, numericAmount);
  }, [book, side, numericAmount]);

  if (!market) return null;

  const sharesOwned = tokenId ? (balances[tokenId] ?? 0) : 0;
  const negRisk = market.negRisk;
  const usdcAllowance = negRisk
    ? account.usdcAllowanceNegRisk
    : account.usdcAllowance;
  const sharesApproved = negRisk
    ? account.sharesApprovedNegRisk
    : account.sharesApproved;

  // Validaciones antes de dejar firmar
  const problems: string[] = [];
  if (!account.isConnected) problems.push('Conecta tu wallet.');
  if (!market.acceptingOrders)
    problems.push('Este mercado no acepta órdenes ahora mismo.');
  if (side === 'buy') {
    if (numericAmount < market.minOrderSize)
      problems.push(`El mínimo por orden es ${formatCurrency(market.minOrderSize)}.`);
    if (numericAmount > account.usdcBalance)
      problems.push('USDC insuficiente en tu wallet.');
    if (numericAmount > usdcAllowance)
      problems.push('Aprueba primero el gasto de USDC.');
  } else {
    if (numericAmount > sharesOwned)
      problems.push('No tienes tantas shares.');
    if (!sharesApproved)
      problems.push('Autoriza primero la transferencia de shares.');
  }
  if (useLimit && !(numericLimit > 0 && numericLimit < 1))
    problems.push('El precio límite debe estar entre 0 y 1.');

  const canSubmit = problems.length === 0 && !trading.isPlacing;

  const submit = async () => {
    if (!tokenId || !canSubmit) return;
    setResult(null);

    const price = useLimit
      ? roundToTick(numericLimit, market.minTickSize, side)
      : undefined;

    const res = await trading.placeOrder({
      tokenId,
      side,
      amount: numericAmount,
      price,
      negRisk,
    });

    setResult({
      ok: res.success,
      msg: res.success
        ? `Orden enviada${res.status ? ` (${res.status})` : ''}.`
        : (res.error ?? 'Error desconocido.'),
      orderId: res.orderId,
      txHashes: res.txHashes,
      blocked: res.blocked,
    });

    if (res.success) window.setTimeout(() => account.refetch(), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-4 py-8">
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl rounded-2xl bg-[#0b0d13] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 bg-[#101420] flex items-start justify-between gap-3">
          <div className="pr-2">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                Dinero real · Polygon
              </span>
              {negRisk && (
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/25">
                  negRisk
                </span>
              )}
              {!market.acceptingOrders && (
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                  cerrado
                </span>
              )}
            </div>
            {/* Contexto del evento, y la pregunta concreta debajo */}
            <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-0.5">
              {event.title}
            </p>
            <h3 className="text-sm font-bold text-neutral-100 leading-snug">
              {market.optionLabel ?? market.question}
            </h3>
            <p className="text-[11px] font-mono text-neutral-500 mt-1">
              Liquidez {formatCurrency(market.liquidityUsd)} · Vol 24h{' '}
              {formatCurrency(market.volume24hUsd)}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selector de opción, solo si el evento tiene varias */}
        {event.markets.length > 1 && (
          <div className="px-5 py-3 border-b border-neutral-800 bg-[#0d1017]">
            <p className="text-[10px] uppercase font-mono text-neutral-600 tracking-wider mb-2">
              Opción del evento ({event.markets.length})
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {event.markets.map((m) => {
                const active = m.id === market.id;
                const pct = Math.round((m.prices[0] ?? 0) * 100);
                return (
                  <button
                    key={m.id}
                    onClick={() => setMarket(m)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 ${
                      active
                        ? 'bg-neutral-100 text-neutral-900'
                        : 'bg-[#12151d] text-neutral-400 border border-neutral-800 hover:text-neutral-200'
                    }`}
                  >
                    <span className="max-w-[160px] truncate">
                      {m.optionLabel ?? m.question}
                    </span>
                    <span
                      className={`font-mono ${active ? 'text-neutral-600' : 'text-neutral-500'}`}
                    >
                      {pct}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Columna izquierda: libro */}
          <div className="flex flex-col gap-3">
            {/* Selector de resultado */}
            <div className="grid grid-cols-2 gap-2">
              {market.outcomes.map((label, i) => (
                <button
                  key={i}
                  onClick={() => setOutcomeIndex(i)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                    outcomeIndex === i
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                      : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <div>{label}</div>
                  <div className="font-mono text-[11px] mt-0.5 opacity-80">
                    ${market.prices[i]?.toFixed(3)}
                  </div>
                </button>
              ))}
            </div>

            {/* Libro en vivo */}
            <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
                  Libro en vivo
                </span>
                {!book && !bookError && (
                  <Loader2 className="w-3 h-3 animate-spin text-neutral-600" />
                )}
              </div>

              {bookError ? (
                <p className="text-[11px] text-rose-400">{bookError}</p>
              ) : book ? (
                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                  <div>
                    <div className="text-emerald-400/70 mb-1">Compras</div>
                    {book.bids.slice(0, 5).map((l, i) => (
                      <div key={i} className="flex justify-between text-neutral-300">
                        <span>${l.price.toFixed(3)}</span>
                        <span className="text-neutral-500">
                          {l.size.toFixed(0)}
                        </span>
                      </div>
                    ))}
                    {book.bids.length === 0 && (
                      <div className="text-neutral-600">vacío</div>
                    )}
                  </div>
                  <div>
                    <div className="text-rose-400/70 mb-1">Ventas</div>
                    {book.asks.slice(0, 5).map((l, i) => (
                      <div key={i} className="flex justify-between text-neutral-300">
                        <span>${l.price.toFixed(3)}</span>
                        <span className="text-neutral-500">
                          {l.size.toFixed(0)}
                        </span>
                      </div>
                    ))}
                    {book.asks.length === 0 && (
                      <div className="text-neutral-600">vacío</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Tu situación on-chain */}
            <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3 flex flex-col gap-1.5 text-[11px] font-mono">
              <div className="flex justify-between">
                <span className="text-neutral-500">USDC en wallet</span>
                <span className="text-neutral-200">
                  {formatCurrency(account.usdcBalance)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">
                  Shares de {market.outcomes[outcomeIndex]}
                </span>
                <span className="text-neutral-200">
                  {sharesOwned.toFixed(2)}
                </span>
              </div>
            </div>

            <PreflightChecklist
              negRisk={negRisk}
              plannedSpendUsd={side === 'buy' ? numericAmount : 0}
              onConnectClick={onConnectWallet}
            />

            <ApprovalsPanel negRisk={negRisk} />

            <OpenOrdersPanel onChanged={() => account.refetch()} />
          </div>

          {/* Columna derecha: orden */}
          <div className="flex flex-col gap-3">
            {/* Comprar / Vender */}
            <div className="grid grid-cols-2 gap-2">
              {(['buy', 'sell'] as TradeSide[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSide(s);
                    setLimitPrice('');
                  }}
                  className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                    side === s
                      ? s === 'buy'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                        : 'bg-rose-500/15 border-rose-500 text-rose-300'
                      : 'bg-neutral-900/80 border-neutral-800 text-neutral-400'
                  }`}
                >
                  {s === 'buy' ? 'Comprar' : 'Vender'}
                </button>
              ))}
            </div>

            {/* Monto */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex justify-between">
                <span>{side === 'buy' ? 'USDC a gastar' : 'Shares a vender'}</span>
                <span className="text-[10px] font-normal text-neutral-500">
                  mín {side === 'buy' ? formatCurrency(market.minOrderSize) : '—'}
                </span>
              </label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-sm font-mono font-bold text-neutral-100"
              />
            </div>

            {/* Tipo de orden */}
            <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={useLimit}
                onChange={(e) => setUseLimit(e.target.checked)}
                className="w-3.5 h-3.5 accent-emerald-500"
              />
              <span>Usar precio límite (recomendado)</span>
            </label>

            {useLimit ? (
              <div className="flex flex-col gap-1.5">
                <input
                  type="number"
                  step={market.minTickSize}
                  min="0"
                  max="1"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-sm font-mono text-neutral-100"
                />
                <span className="text-[10px] text-neutral-500">
                  Tick mínimo {market.minTickSize}. Se redondeará al tick más
                  cercano a tu favor.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 p-2.5 text-[11px] text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Sin límite aceptas cualquier precio del libro. En mercados
                  poco líquidos puedes pagar bastante más.
                </span>
              </div>
            )}

            {/* Previsualización del llenado */}
            {fill && fill.shares > 0 && (
              <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3 flex flex-col gap-1.5 text-[11px] font-mono">
                <div className="flex justify-between">
                  <span className="text-neutral-500">
                    {side === 'buy' ? 'Shares estimadas' : 'USDC estimado'}
                  </span>
                  <span className="text-neutral-100 font-bold">
                    {side === 'buy'
                      ? fill.shares.toFixed(2)
                      : formatCurrency(fill.usd)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Precio medio</span>
                  <span className="text-neutral-200">
                    ${fill.avgPrice.toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Peor precio</span>
                  <span className="text-neutral-200">
                    ${fill.worstPrice.toFixed(4)}
                  </span>
                </div>
                {side === 'buy' && (
                  <div className="flex justify-between pt-1.5 border-t border-neutral-800">
                    <span className="text-neutral-500">Pago si acierta</span>
                    <span className="text-emerald-400 font-bold">
                      {formatCurrency(fill.shares)}
                    </span>
                  </div>
                )}
                {fill.partial && (
                  <div className="text-amber-400 pt-1">
                    El libro no tiene profundidad para todo el importe.
                  </div>
                )}
              </div>
            )}

            {/* Problemas */}
            {problems.length > 0 && (
              <div className="rounded-xl bg-neutral-900/70 border border-neutral-800 p-3 flex flex-col gap-1">
                {problems.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] text-amber-300"
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Autenticación CLOB */}
            {trading.auth.status === 'error' && (
              <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
                <Ban className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{trading.auth.error}</span>
              </div>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-98 flex items-center justify-center gap-2 ${
                !canSubmit
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : side === 'buy'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                    : 'bg-rose-500 hover:bg-rose-400 text-black'
              }`}
            >
              {trading.isPlacing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {trading.auth.status === 'authenticating'
                      ? 'Autenticando...'
                      : 'Firmando y enviando...'}
                  </span>
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  <span>
                    Firmar orden de {side === 'buy' ? 'compra' : 'venta'}
                  </span>
                </>
              )}
            </button>

            <p className="text-[10px] text-center text-neutral-500 leading-relaxed">
              Firmas una orden EIP-712, no una transacción. El operador de
              Polymarket la liquida on-chain. Tus fondos no se mueven sin tu
              firma.
            </p>

            {/* Resultado */}
            {result && (
              <div
                className={`rounded-xl border p-3 flex flex-col gap-2 text-[11px] ${
                  result.ok
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  {result.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  )}
                  <span>{result.msg}</span>
                </div>

                {result.blocked && (
                  <span className="text-amber-300">
                    Parece un bloqueo por región. Polymarket restringe el acceso
                    en algunas jurisdicciones y eso no se puede resolver desde
                    la app.
                  </span>
                )}

                {result.orderId && (
                  <span className="font-mono text-neutral-400 break-all">
                    id: {result.orderId}
                  </span>
                )}

                {result.txHashes?.map((h) => (
                  <a
                    key={h}
                    href={txUrl(h)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="font-mono">{h.slice(0, 18)}...</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
