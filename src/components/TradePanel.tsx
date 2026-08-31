import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Loader2,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  ReceiptText,
  Wallet,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  toDecimal,
  type BetReceipt,
  type Market,
  type Quote,
  type VenueError,
} from '../domain/types';
import { marketSources } from '../services/marketSources';
import { useWallet } from '../services/web3Service';
import { useVenueBalances } from '../hooks/useVenueBalances';
import { chainLabel } from '../config/chains';
import {
  groupMarketsForDisplay,
  marketVariantLabelOf,
  optionLabelOf,
  type MarketEventView,
} from '../utils/eventGrouping';
import { formatCurrency } from '../utils/formatters';
import { translateOutcomeLabel } from '../utils/marketLabels';
import { toggleSelection, useBetSlip } from '../hooks/useBetSlip';

interface TradePanelProps {
  /** Evento al que pertenece el mercado, para dar contexto y cambiar de opción. */
  event: MarketEventView;
  /** Mercado (opción) seleccionado inicialmente. */
  market: Market;
  /**
   * Resultado a preseleccionar: la cuota exacta que se clicó en la tarjeta.
   * Si no cotiza (o no existe ya), se cae al primer resultado cotizable.
   */
  initialOutcomeId?: string;
  onClose: () => void;
  onConnectWallet: () => void;
}

const SLIPPAGE_OPTIONS = [0.01, 0.03, 0.05] as const;

/** Importe válido: decimal positivo con hasta 6 decimales. */
function isValidAmount(value: string): boolean {
  return /^\d+(\.\d{1,6})?$/.test(value.trim()) && Number(value) > 0;
}

type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; quote: Quote }
  | { status: 'error'; error: VenueError };

type PlaceState =
  | { status: 'idle' }
  | { status: 'placing' }
  | { status: 'done'; receipt: BetReceipt }
  | { status: 'error'; error: VenueError };

/** Botón del selector de mercado: etiqueta + cotización de un vistazo. */
const MarketPickButton: React.FC<{
  label: string;
  quote: string;
  active: boolean;
  onClick: () => void;
  fullWidth?: boolean;
}> = ({ label, quote, active, onClick, fullWidth = false }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
      fullWidth ? 'w-full justify-between text-left' : 'shrink-0'
    } ${
      active
        ? 'bg-neutral-100 text-neutral-900'
        : 'bg-[#12151d] text-neutral-400 border border-neutral-800 hover:text-neutral-200'
    }`}
  >
    <span className="truncate max-w-[220px]">{label}</span>
    <span className={`font-mono ${active ? 'text-neutral-600' : 'text-neutral-500'}`}>
      {quote}
    </span>
  </button>
);

/**
 * Cotización de un vistazo para el selector: cuota decimal en venues de
 * cuotas, % en el resto. Sin precio: raya, nunca 0.
 */
function firstQuoteOf(m: Market): string {
  const o = m.outcomes[0];
  if (o === undefined) return '—';
  if (m.priceFormat === 'decimal-odds' && o.price !== null) {
    return Number(o.price).toFixed(2);
  }
  return o.probability === null ? '—' : `${Math.round(o.probability * 100)}%`;
}


/**
 * Operativa real contra el puerto del dominio: cotización ejecutable
 * (`getQuote`) y colocación de la apuesta (`placeBet`). Este componente no
 * sabe qué venue hay detrás; todo lo que muestra sale del dominio.
 */
export const TradePanel: React.FC<TradePanelProps> = ({
  event,
  market: initialMarket,
  initialOutcomeId,
  onClose,
  onConnectWallet,
}) => {
  const [market, setMarket] = useState<Market>(initialMarket);
  const [outcomeId, setOutcomeId] = useState<string>(() => {
    // La cuota clicada manda, si sigue cotizando; si no, el primer cotizable.
    const clicked = initialMarket.outcomes.find(
      (o) => o.id === initialOutcomeId && o.isQuotable,
    );
    return (
      clicked?.id ??
      initialMarket.outcomes.find((o) => o.isQuotable)?.id ??
      initialMarket.outcomes[0]?.id ??
      ''
    );
  });
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState<number>(0.05);
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: 'idle' });
  const [placeState, setPlaceState] = useState<PlaceState>({ status: 'idle' });
  const [quoteNonce, setQuoteNonce] = useState(0);

  const wallet = useWallet();
  const { balances } = useVenueBalances();
  const { isSelected } = useBetSlip();

  const source = marketSources.sourceFor(market.id);
  const venueToken = balances.find((b) => b.venue === market.venue) ?? null;
  const outcome = market.outcomes.find((o) => o.id === outcomeId) ?? null;

  const marketGroups = useMemo(
    () => groupMarketsForDisplay(event.markets),
    [event.markets],
  );

  // Al cambiar de opción dentro del evento, se reinicia la selección. En el
  // mercado inicial se respeta la cuota clicada en la tarjeta.
  useEffect(() => {
    const clicked =
      market.id === initialMarket.id
        ? market.outcomes.find((o) => o.id === initialOutcomeId && o.isQuotable)
        : undefined;
    setOutcomeId(
      clicked?.id ??
        market.outcomes.find((o) => o.isQuotable)?.id ??
        market.outcomes[0]?.id ??
        '',
    );
    setQuoteState({ status: 'idle' });
    setPlaceState({ status: 'idle' });
  }, [market.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cotización con retardo: una petición por pausa de tecleo, no por tecla.
  useEffect(() => {
    setPlaceState((prev) => (prev.status === 'done' ? prev : { status: 'idle' }));
    if (source === null || outcomeId === '' || !isValidAmount(amount)) {
      setQuoteState({ status: 'idle' });
      return;
    }
    let alive = true;
    setQuoteState({ status: 'loading' });
    const timer = window.setTimeout(async () => {
      const result = await source.getQuote(
        market.id,
        outcomeId,
        toDecimal(amount.trim()),
      );
      if (!alive) return;
      setQuoteState(
        result.ok
          ? { status: 'ok', quote: result.data }
          : { status: 'error', error: result.error },
      );
    }, 450);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [source, market.id, outcomeId, amount, quoteNonce]);

  const quote = quoteState.status === 'ok' ? quoteState.quote : null;
  const payoutNumber = quote === null ? null : Number(quote.expectedPayout);
  const stakeNumber = isValidAmount(amount) ? Number(amount) : 0;

  const problems: string[] = [];
  if (!wallet.isConnected) problems.push('Conecta tu wallet para apostar.');
  if (source !== null && !source.capabilities.canPlaceBet) {
    problems.push(
      `Este despliegue no tiene credenciales para apostar en ${source.displayName} (revisa .env).`,
    );
  }
  if (!market.isQuotable) {
    problems.push('Este mercado no acepta apuestas ahora mismo.');
  }
  if (
    venueToken?.balance != null &&
    stakeNumber > 0 &&
    stakeNumber > venueToken.balance
  ) {
    problems.push(`${venueToken.symbol} insuficiente en tu wallet.`);
  }

  const canPlace =
    quote !== null &&
    problems.length === 0 &&
    placeState.status !== 'placing' &&
    wallet.address !== null;

  const place = async () => {
    if (!canPlace || source === null || quote === null || wallet.address === null) {
      return;
    }
    setPlaceState({ status: 'placing' });
    const result = await source.placeBet(quote, {
      slippageTolerance: slippage,
      from: wallet.address,
    });
    if (result.ok) {
      setPlaceState({ status: 'done', receipt: result.data });
      try {
        confetti({ particleCount: 45, spread: 60, origin: { y: 0.8 } });
      } catch {
        // decorativo
      }
    } else {
      setPlaceState({ status: 'error', error: result.error });
    }
  };

  const impliedPrice = useMemo(() => {
    if (payoutNumber === null || payoutNumber <= 0 || stakeNumber <= 0) return null;
    return stakeNumber / payoutNumber;
  }, [payoutNumber, stakeNumber]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-4 py-8">
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-xl rounded-2xl bg-[#0b0d13] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        {/* Cabecera */}
        <div className="p-5 border-b border-neutral-800 bg-[#101420] flex items-start justify-between gap-3">
          <div className="pr-2">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                Dinero real · {chainLabel(market.chainId)}
              </span>
              {source !== null && (
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                  {source.displayName}
                </span>
              )}
              {!market.isQuotable && (
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                  sin cotización
                </span>
              )}
            </div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-0.5">
              {event.title}
            </p>
            <h3 className="text-sm font-bold text-neutral-100 leading-snug">
              {optionLabelOf(market)}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selector de mercado, solo si el evento tiene varios. Agrupado por
            tipo (Total Games, Handicap…) con las líneas ordenadas: 30 chips
            iguales en una fila no se pueden recorrer. */}
        {event.markets.length > 1 && (
          <div className="px-5 py-3 border-b border-neutral-800 bg-[#0d1017]">
            <p className="text-[10px] uppercase font-mono text-neutral-600 tracking-wider mb-2">
              Mercados del evento ({event.markets.length})
            </p>
            <div className="max-h-56 overflow-y-auto flex flex-col gap-2.5 pr-1">
              {marketGroups.map((g) =>
                g.markets.length === 1 ? (
                  <MarketPickButton
                    key={g.markets[0].id}
                    label={g.label}
                    quote={firstQuoteOf(g.markets[0])}
                    active={g.markets[0].id === market.id}
                    onClick={() => setMarket(g.markets[0])}
                    fullWidth
                  />
                ) : (
                  <div key={g.label} className="flex flex-col gap-1">
                    <p className="text-[10px] font-mono text-neutral-500">
                      {g.label}
                      <span className="text-neutral-700">
                        {' '}
                        · {g.markets.length} líneas
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.markets.map((m) => (
                        <MarketPickButton
                          key={m.id}
                          label={marketVariantLabelOf(m)}
                          quote={firstQuoteOf(m)}
                          active={m.id === market.id}
                          onClick={() => setMarket(m)}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        <div className="p-5 flex flex-col gap-4">
          {/* Selector de resultado */}
          <div
            className={`grid gap-2 ${
              market.outcomes.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}
          >
            {market.outcomes.map((o) => (
              <button
                key={o.id}
                onClick={() => setOutcomeId(o.id)}
                disabled={!o.isQuotable}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  outcomeId === o.id
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                    : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <div className="truncate">{translateOutcomeLabel(o.label)}</div>
                <div className="font-mono text-[11px] mt-0.5 opacity-80">
                  {o.probability === null
                    ? 'sin cotización'
                    : market.priceFormat === 'decimal-odds' && o.price !== null
                      ? `${Number(o.price).toFixed(2)} · ${Math.round(o.probability * 100)}%`
                      : `${Math.round(o.probability * 100)}%`}
                </div>
              </button>
            ))}
          </div>

          {/* Al boleto: acumula esta selección para apostarla en tanda o en
              combinada, sin salir del panel (se puede seguir añadiendo). */}
          {outcome !== null && (
            <button
              onClick={() => toggleSelection(event.title, market, outcomeId)}
              className={`w-full py-2 rounded-xl text-[11px] font-bold transition-all active:scale-98 flex items-center justify-center gap-1.5 border ${
                isSelected(market.id, outcomeId)
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-neutral-100'
              }`}
            >
              <ReceiptText className="w-3.5 h-3.5" />
              <span>
                {isSelected(market.id, outcomeId)
                  ? 'En el boleto — clic para quitar'
                  : `Añadir al boleto (${translateOutcomeLabel(outcome.label)})`}
              </span>
            </button>
          )}

          {/* Importe */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-neutral-300 flex justify-between">
              <span>
                {venueToken !== null
                  ? `${venueToken.symbol} a apostar`
                  : 'Importe a apostar'}
              </span>
              {venueToken?.balance != null && (
                <span className="text-[10px] font-normal text-neutral-500">
                  tienes {formatCurrency(venueToken.balance)}
                </span>
              )}
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-sm font-mono font-bold text-neutral-100"
            />
          </div>

          {/* Slippage */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
              Slippage máx.
            </span>
            {SLIPPAGE_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all ${
                  slippage === s
                    ? 'bg-neutral-100 text-neutral-900'
                    : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-neutral-200'
                }`}
              >
                {(s * 100).toFixed(0)}%
              </button>
            ))}
          </div>

          {/* Cotización */}
          <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3 flex flex-col gap-1.5 text-[11px] font-mono min-h-[74px]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-neutral-500 tracking-wider">
                Cotización ejecutable
              </span>
              <button
                onClick={() => setQuoteNonce((n) => n + 1)}
                disabled={quoteState.status === 'loading'}
                title="Recotizar"
                className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3 h-3 ${quoteState.status === 'loading' ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {quoteState.status === 'idle' && (
              <span className="text-neutral-600">
                Escribe un importe para cotizar contra el mercado real.
              </span>
            )}
            {quoteState.status === 'loading' && (
              <span className="flex items-center gap-2 text-neutral-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                Cotizando…
              </span>
            )}
            {quoteState.status === 'error' && (
              <span className="text-amber-300">{quoteState.error.message}</span>
            )}
            {quote !== null && payoutNumber !== null && (
              <>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Pago si acierta</span>
                  <span className="text-emerald-400 font-bold">
                    {formatCurrency(payoutNumber)}
                  </span>
                </div>
                {impliedPrice !== null && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Precio medio implícito</span>
                    <span className="text-neutral-200">
                      ${impliedPrice.toFixed(4)}
                    </span>
                  </div>
                )}
                {quote.priceImpact !== null && quote.priceImpact > 0.005 && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Impacto en precio</span>
                    <span
                      className={
                        quote.priceImpact > 0.05 ? 'text-amber-400' : 'text-neutral-200'
                      }
                    >
                      {(quote.priceImpact * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

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
              {!wallet.isConnected && (
                <button
                  onClick={onConnectWallet}
                  className="mt-1 self-start px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-bold transition-all active:scale-95"
                >
                  Conectar wallet
                </button>
              )}
            </div>
          )}

          <button
            onClick={place}
            disabled={!canPlace}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-98 flex items-center justify-center gap-2 ${
              !canPlace
                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black'
            }`}
          >
            {placeState.status === 'placing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Firmando y enviando…</span>
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4" />
                <span>
                  Apostar
                  {outcome !== null
                    ? ` a ${translateOutcomeLabel(outcome.label)}`
                    : ''}
                  {isValidAmount(amount) && venueToken !== null
                    ? ` · ${amount} ${venueToken.symbol}`
                    : ''}
                </span>
              </>
            )}
          </button>

          <p className="text-[10px] text-center text-neutral-500 leading-relaxed">
            La apuesta se firma con tu wallet (EIP-712). Si hace falta aprobar
            el gasto del token, la wallet te pedirá esa firma primero.
          </p>

          {/* Resultado */}
          {placeState.status === 'done' && (
            <div className="rounded-xl border p-3 flex flex-col gap-2 text-[11px] bg-emerald-500/10 border-emerald-500/25 text-emerald-300">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Apuesta {placeState.receipt.status === 'confirmed'
                    ? 'confirmada'
                    : 'enviada (pendiente de confirmación)'}
                  .
                </span>
              </div>
              <span className="font-mono text-neutral-400 break-all">
                ref: {placeState.receipt.reference}
              </span>
              {placeState.receipt.explorerUrl !== null && (
                <a
                  href={placeState.receipt.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="font-mono">Ver en el explorador</span>
                </a>
              )}
            </div>
          )}
          {placeState.status === 'error' && (
            <div className="rounded-xl border p-3 flex items-start gap-2 text-[11px] bg-rose-500/10 border-rose-500/25 text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{placeState.error.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
