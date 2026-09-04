import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Loader2,
  AlertTriangle,
  ChevronDown,
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
  marketGroupShapeOf,
  marketLineOf,
  marketVariantLabelOf,
  optionLabelOf,
  outcomeForParticipant,
  outcomeLineOf,
  type MarketDisplayGroup,
  type MarketEventView,
} from '../utils/eventGrouping';
import { isValidAmount, outcomeOddsText } from '../utils/betting';
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

/** Cotización de un vistazo para el selector: la del primer resultado. */
function firstQuoteOf(m: Market): string {
  return outcomeOddsText(m, m.outcomes[0]);
}

/** "-7.5" se muestra tal cual; a "1.5" se le antepone el "+" de hándicap. */
function signedLine(line: string): string {
  return line.startsWith('-') ? line : `+${line}`;
}

/** Celda de cuota del selector: (línea +) cuota, clicable como selección. */
const OddsCell: React.FC<{
  label?: string;
  quote: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ label, quote, active, disabled = false, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-center gap-1.5 px-2 py-2 sm:py-1.5 rounded-lg border text-[11px] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed min-w-0 ${
      active
        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
        : 'bg-[#12151d] border-neutral-800 hover:border-emerald-500/40 hover:bg-emerald-500/[0.06] text-neutral-300'
    }`}
  >
    {label !== undefined && (
      <span className="truncate font-mono text-neutral-400">{label}</span>
    )}
    <span className="font-mono font-bold">{quote}</span>
  </button>
);

/**
 * Una sección plegable del selector: un grupo de mercados pintado según su
 * forma — tabla Más/Menos para totales, columna por participante para
 * hándicaps, fila de resultados para mercados únicos, chips para el resto.
 * Cada celda selecciona mercado Y resultado de un clic.
 */
const SelectorSection: React.FC<{
  group: MarketDisplayGroup;
  participants?: { name: string }[];
  activeMarketId: string;
  activeOutcomeId: string;
  collapsed: boolean;
  onToggle: () => void;
  onPick: (m: Market, outcomeId?: string) => void;
}> = ({
  group,
  participants,
  activeMarketId,
  activeOutcomeId,
  collapsed,
  onToggle,
  onPick,
}) => {
  const shape = marketGroupShapeOf(group.markets, participants);
  const single = group.markets.length === 1 ? group.markets[0] : null;
  const isActiveCell = (m: Market, outcomeId: string) =>
    m.id === activeMarketId && outcomeId === activeOutcomeId;

  let body: React.ReactNode;
  if (shape === 'over-under') {
    body = (
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-[2.75rem_1fr_1fr] gap-1.5 px-1 text-[9px] font-mono uppercase tracking-wider text-neutral-600">
          <span />
          <span className="text-center">Más</span>
          <span className="text-center">Menos</span>
        </div>
        {group.markets.map((m) => {
          const over = m.outcomes.find((o) => /^over\s*\(/i.test(o.label));
          const under = m.outcomes.find((o) => /^under\s*\(/i.test(o.label));
          if (over === undefined || under === undefined) return null;
          return (
            <div
              key={m.id}
              className="grid grid-cols-[2.75rem_1fr_1fr] gap-1.5 items-center"
            >
              <span className="text-[11px] font-mono text-neutral-400 text-right pr-1">
                {marketLineOf(m)}
              </span>
              <OddsCell
                quote={outcomeOddsText(m, over)}
                active={isActiveCell(m, over.id)}
                disabled={!over.isQuotable}
                onClick={() => onPick(m, over.id)}
              />
              <OddsCell
                quote={outcomeOddsText(m, under)}
                active={isActiveCell(m, under.id)}
                disabled={!under.isQuotable}
                onClick={() => onPick(m, under.id)}
              />
            </div>
          );
        })}
      </div>
    );
  } else if (shape === 'two-sided' && participants !== undefined) {
    const [pa, pb] = participants;
    body = (
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-2 gap-1.5 px-1 text-[9px] font-mono uppercase tracking-wider text-neutral-600">
          <span className="text-center truncate">{pa.name}</span>
          <span className="text-center truncate">{pb.name}</span>
        </div>
        {group.markets.map((m) => {
          const oa = outcomeForParticipant(m, pa.name);
          const ob = outcomeForParticipant(m, pb.name);
          if (oa === undefined || ob === undefined) return null;
          const la = outcomeLineOf(oa.label);
          const lb = outcomeLineOf(ob.label);
          return (
            <div key={m.id} className="grid grid-cols-2 gap-1.5">
              <OddsCell
                {...(la !== null ? { label: signedLine(la) } : {})}
                quote={outcomeOddsText(m, oa)}
                active={isActiveCell(m, oa.id)}
                disabled={!oa.isQuotable}
                onClick={() => onPick(m, oa.id)}
              />
              <OddsCell
                {...(lb !== null ? { label: signedLine(lb) } : {})}
                quote={outcomeOddsText(m, ob)}
                active={isActiveCell(m, ob.id)}
                disabled={!ob.isQuotable}
                onClick={() => onPick(m, ob.id)}
              />
            </div>
          );
        })}
      </div>
    );
  } else if (single !== null && single.outcomes.length <= 3) {
    body = (
      <div
        className={`grid gap-1.5 ${
          single.outcomes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
        }`}
      >
        {single.outcomes.map((o) => (
          <OddsCell
            key={o.id}
            label={translateOutcomeLabel(o.label)}
            quote={outcomeOddsText(single, o)}
            active={isActiveCell(single, o.id)}
            disabled={!o.isQuotable}
            onClick={() => onPick(single, o.id)}
          />
        ))}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-wrap gap-1.5">
        {group.markets.map((m) => (
          <MarketPickButton
            key={m.id}
            label={single !== null ? group.label : marketVariantLabelOf(m)}
            quote={firstQuoteOf(m)}
            active={m.id === activeMarketId}
            onClick={() => onPick(m)}
            fullWidth={single !== null}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="border-b border-neutral-800/60 last:border-0 pb-2">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 py-1.5 text-left"
      >
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
          {group.label}
          {group.markets.length > 1 && (
            <span className="text-neutral-600"> · {group.markets.length} líneas</span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-600 transition-transform shrink-0 ${
            collapsed ? '-rotate-90' : ''
          }`}
        />
      </button>
      {!collapsed && body}
    </div>
  );
};


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
  /** Secciones del selector plegadas por el usuario, por etiqueta de grupo. */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  /**
   * Resultado clicado en una celda del selector, pendiente de aplicarse
   * cuando `market` cambie (el efecto de cambio de mercado lo consume).
   */
  const pendingOutcomeRef = useRef<string | null>(null);

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

  // Al cambiar de opción dentro del evento, se reinicia la selección. Manda
  // la celda clicada en el selector; en el mercado inicial, la cuota clicada
  // en la tarjeta.
  useEffect(() => {
    const pending = pendingOutcomeRef.current;
    pendingOutcomeRef.current = null;
    const fromCell =
      pending !== null
        ? market.outcomes.find((o) => o.id === pending && o.isQuotable)
        : undefined;
    const clicked =
      market.id === initialMarket.id
        ? market.outcomes.find((o) => o.id === initialOutcomeId && o.isQuotable)
        : undefined;
    setOutcomeId(
      fromCell?.id ??
        clicked?.id ??
        market.outcomes.find((o) => o.isQuotable)?.id ??
        market.outcomes[0]?.id ??
        '',
    );
    setQuoteState({ status: 'idle' });
    setPlaceState({ status: 'idle' });
  }, [market.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Clic en una celda del selector: mercado y, si viene, resultado exactos. */
  const pickSelection = (m: Market, oid?: string) => {
    if (m.id === market.id) {
      if (oid !== undefined) setOutcomeId(oid);
      return;
    }
    pendingOutcomeRef.current = oid ?? null;
    setMarket(m);
  };

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
    /* En móvil, hoja a pantalla completa (mismo criterio que BetSlip);
       en ≥sm, modal centrado con margen. */
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-0 sm:p-4 sm:py-8">
      <div
        className="fixed inset-0 bg-black/85 backdrop-blur-md animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-xl min-h-full sm:min-h-0 rounded-none sm:rounded-2xl bg-[#0b0d13] border-0 sm:border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        {/* Cabecera */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 bg-[#101420] flex items-start justify-between gap-3">
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
              {event.isLive && (
                <span className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  En vivo
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
            className="p-2.5 sm:p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selector de mercado, solo si el evento tiene varios. Secciones
            plegables por tipo, con la forma de cada grupo: totales como tabla
            Más/Menos, hándicaps con una columna por participante, y cada
            celda selecciona mercado y resultado de un clic. */}
        {event.markets.length > 1 && (
          <div className="px-4 sm:px-5 py-3 border-b border-neutral-800 bg-[#0d1017]">
            <p className="text-[10px] uppercase font-mono text-neutral-600 tracking-wider mb-1.5">
              Mercados del evento ({event.markets.length})
            </p>
            <div className="max-h-80 overflow-y-auto flex flex-col gap-2 pr-1">
              {marketGroups.map((g) => (
                <SelectorSection
                  key={g.label}
                  group={g}
                  participants={event.participants}
                  activeMarketId={market.id}
                  activeOutcomeId={outcomeId}
                  collapsed={collapsedGroups.has(g.label)}
                  onToggle={() =>
                    setCollapsedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.label)) next.delete(g.label);
                      else next.add(g.label);
                      return next;
                    })
                  }
                  onPick={pickSelection}
                />
              ))}
            </div>
          </div>
        )}

        <div className="p-4 sm:p-5 flex flex-col gap-4">
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
              Slippage máx.
            </span>
            {SLIPPAGE_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={`px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-[11px] font-mono font-bold transition-all ${
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
