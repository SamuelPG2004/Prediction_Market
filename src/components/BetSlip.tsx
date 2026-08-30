import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ReceiptText,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  toDecimal,
  type ComboQuote,
  type Market,
  type MarketSource,
  type Quote,
  type VenueError,
} from '../domain/types';
import { marketSources } from '../services/marketSources';
import { useWallet } from '../services/web3Service';
import {
  clearSelections,
  removeSelection,
  useBetSlip,
  type BetSlipSelection,
} from '../hooks/useBetSlip';
import { optionLabelOf } from '../utils/eventGrouping';
import { formatCurrency } from '../utils/formatters';

/** Importe válido: decimal positivo con hasta 6 decimales. */
function isValidAmount(value: string): boolean {
  return /^\d+(\.\d{1,6})?$/.test(value.trim()) && Number(value) > 0;
}

type ItemQuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; quote: Quote }
  | { status: 'error'; error: VenueError };

type ItemPlaceState =
  | { status: 'idle' }
  | { status: 'placing' }
  | { status: 'done'; reference: string; explorerUrl: string | null }
  | { status: 'error'; error: VenueError };

/** Lo que cada fila registra para que "Apostar todo" la dispare en secuencia. */
interface SlipItemApi {
  /** Coloca la apuesta si hay cotización fresca. Resuelve al terminar. */
  place: () => Promise<void>;
  isReady: () => boolean;
}

const SLIPPAGE = 0.05;

/**
 * Boleto de apuestas: las cuotas clicadas se acumulan aquí para apostar en
 * tanda. Cada selección es una apuesta SIMPLE independiente — se cotiza por
 * separado contra su venue y "Apostar todo" las firma una tras otra (cada
 * firma la pide la wallet). Solo dominio: no sabe qué venue hay detrás.
 */
export const BetSlip: React.FC<{ onConnectWallet: () => void }> = ({
  onConnectWallet,
}) => {
  const { selections } = useBetSlip();
  const [isOpen, setIsOpen] = useState(false);
  const [isPlacingAll, setIsPlacingAll] = useState(false);
  const wallet = useWallet();

  // Las filas cotizan por su cuenta; este tick re-renderiza el pie (contador
  // de listas y botón) cuando el estado de una fila cambia.
  const [, setTick] = useState(0);
  const onItemChanged = useCallback(() => setTick((t) => t + 1), []);

  // Modo del boleto: apuestas simples (una firma por selección) o combinada
  // (una sola apuesta cuyo pago exige acertar todas).
  const [mode, setMode] = useState<'simple' | 'combo'>('simple');

  const venueIds = [...new Set(selections.map((s) => s.market.venue))];
  const comboSource = venueIds.length === 1 ? marketSources.byVenue(venueIds[0]) : null;
  const gameIds = selections.map((s) => s.market.group?.id);
  const distinctGames =
    !gameIds.includes(undefined) && new Set(gameIds).size === selections.length;
  const comboAvailable =
    selections.length >= 2 &&
    comboSource !== null &&
    comboSource.capabilities.canCombo &&
    distinctGames;
  /** Por qué no hay combinada, para decirlo en vez de esconder la pestaña. */
  const comboReason =
    selections.length < 2
      ? 'Añade al menos dos selecciones.'
      : venueIds.length > 1
        ? 'Las selecciones mezclan dos casas distintas; una combinada vive en una sola.'
        : comboSource !== null && !comboSource.capabilities.canCombo
          ? `${comboSource.displayName} no ofrece apuestas combinadas.`
          : !distinctGames
            ? 'Hay dos selecciones del mismo partido: no se pueden combinar.'
            : null;

  // Si la combinada deja de ser posible (se quitó una pata, se mezclaron
  // venues), el boleto vuelve solo al modo simple.
  useEffect(() => {
    if (!comboAvailable && mode === 'combo') setMode('simple');
  }, [comboAvailable, mode]);

  // Al añadir la primera selección el cajón se abre solo: el usuario acaba de
  // clicar una cuota y debe ver dónde cayó.
  const prevCount = useRef(0);
  useEffect(() => {
    if (selections.length > 0 && prevCount.current === 0) setIsOpen(true);
    prevCount.current = selections.length;
  }, [selections.length]);

  const itemApis = useRef(new Map<string, SlipItemApi>());

  const placeAll = async () => {
    if (isPlacingAll) return;
    setIsPlacingAll(true);
    try {
      // En secuencia, nunca en paralelo: cada apuesta pide su firma a la
      // wallet y las transacciones de una misma cadena no toleran carreras.
      for (const selection of selections) {
        const api = itemApis.current.get(selection.market.id);
        if (api !== undefined && api.isReady()) await api.place();
      }
    } finally {
      setIsPlacingAll(false);
    }
  };

  const readyCount = selections.filter((s) =>
    itemApis.current.get(s.market.id)?.isReady(),
  ).length;

  if (selections.length === 0) return null;

  return (
    <>
      {/* Botón flotante con el contador de selecciones */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold shadow-2xl shadow-emerald-500/20 transition-all active:scale-95"
        >
          <ReceiptText className="w-4 h-4" />
          <span>Boleto</span>
          <span className="px-1.5 py-0.5 rounded-full bg-black/20 font-mono text-[11px]">
            {selections.length}
          </span>
        </button>
      )}

      {/* Cajón */}
      {isOpen && (
        <div className="fixed bottom-0 right-0 top-0 z-40 w-full sm:w-[380px] sm:bottom-4 sm:right-4 sm:top-auto sm:max-h-[85vh] flex flex-col rounded-none sm:rounded-2xl bg-[#0b0d13] border border-neutral-800 shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 bg-[#101420] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-neutral-100">
                Boleto · {selections.length}
              </h3>
              <span className="text-[10px] font-mono text-neutral-500">
                apuestas simples
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearSelections}
                title="Vaciar el boleto"
                className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Minimizar"
                className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Simples / Combinada */}
          <div className="px-3 pt-3 flex items-center gap-1.5 shrink-0">
            <ModeTab
              label="Simples"
              active={mode === 'simple'}
              onClick={() => setMode('simple')}
            />
            <ModeTab
              label="Combinada"
              active={mode === 'combo'}
              disabled={!comboAvailable}
              title={comboReason ?? undefined}
              onClick={() => comboAvailable && setMode('combo')}
            />
            {!comboAvailable && comboReason !== null && (
              <span className="text-[9.5px] text-neutral-600 leading-tight flex-1 min-w-0">
                {comboReason}
              </span>
            )}
          </div>

          {mode === 'combo' && comboSource !== null ? (
            <ComboPane
              selections={selections}
              source={comboSource}
              walletAddress={wallet.address}
              walletConnected={wallet.isConnected}
              onConnectWallet={onConnectWallet}
            />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
                {selections.map((selection) => (
                  <SlipItem
                    key={selection.market.id}
                    selection={selection}
                    registry={itemApis.current}
                    walletAddress={wallet.address}
                    onChanged={onItemChanged}
                  />
                ))}
              </div>

              <div className="p-3 border-t border-neutral-800 bg-[#0d1017] flex flex-col gap-2 shrink-0">
                {!wallet.isConnected && (
                  <button
                    onClick={onConnectWallet}
                    className="w-full py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-[11px] font-bold text-amber-300 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Conecta tu wallet para apostar
                  </button>
                )}
                <button
                  onClick={placeAll}
                  disabled={!wallet.isConnected || readyCount === 0 || isPlacingAll}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-98 flex items-center justify-center gap-2 ${
                    !wallet.isConnected || readyCount === 0 || isPlacingAll
                      ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                  }`}
                >
                  {isPlacingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Firmando una a una…</span>
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4" />
                      <span>
                        {readyCount === 0
                          ? 'Escribe importes para cotizar'
                          : `Apostar ${readyCount} ${readyCount === 1 ? 'selección' : 'selecciones'}`}
                      </span>
                    </>
                  )}
                </button>
                <p className="text-[10px] text-center text-neutral-600 leading-relaxed">
                  Apuestas simples independientes: la wallet pedirá una firma
                  por cada una, en orden.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

const ModeTab: React.FC<{
  label: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}> = ({ label, active, disabled = false, title, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
      active
        ? 'bg-neutral-100 text-neutral-900'
        : disabled
          ? 'bg-neutral-900 text-neutral-700 cursor-not-allowed'
          : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-neutral-200'
    }`}
  >
    {label}
  </button>
);

type ComboQuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; quote: ComboQuote }
  | { status: 'error'; error: VenueError };

type ComboPlaceState =
  | { status: 'idle' }
  | { status: 'placing' }
  | { status: 'done'; reference: string; explorerUrl: string | null }
  | { status: 'error'; error: VenueError };

/**
 * Modo combinada: una sola apuesta cuyo pago exige acertar TODAS las patas.
 * Un importe, una cotización (`getComboQuote`) y una única firma.
 */
const ComboPane: React.FC<{
  selections: readonly BetSlipSelection[];
  source: MarketSource;
  walletAddress: string | null;
  walletConnected: boolean;
  onConnectWallet: () => void;
}> = ({ selections, source, walletAddress, walletConnected, onConnectWallet }) => {
  const [amount, setAmount] = useState('');
  const [quoteState, setQuoteState] = useState<ComboQuoteState>({ status: 'idle' });
  const [placeState, setPlaceState] = useState<ComboPlaceState>({ status: 'idle' });

  // Vista previa del producto de cuotas con los precios del catálogo; la
  // cuota firme la da el venue al cotizar.
  const previewOdds = selections.reduce((acc: number | null, s) => {
    if (acc === null) return null;
    const o = s.market.outcomes.find((x) => x.id === s.outcomeId);
    if (o === undefined || o.price === null || s.market.priceFormat !== 'decimal-odds') {
      return null;
    }
    return acc * Number(o.price);
  }, 1);

  const selectionsKey = selections
    .map((s) => `${s.market.id}#${s.outcomeId}`)
    .join('|');

  useEffect(() => {
    if (placeState.status === 'done') return;
    if (!isValidAmount(amount)) {
      setQuoteState({ status: 'idle' });
      return;
    }
    let alive = true;
    setQuoteState({ status: 'loading' });
    const timer = window.setTimeout(async () => {
      const result = await source.getComboQuote(
        selections.map((s) => ({ marketId: s.market.id, outcomeId: s.outcomeId })),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, amount, selectionsKey, placeState.status]);

  const quote = quoteState.status === 'ok' ? quoteState.quote : null;

  const place = async () => {
    if (quote === null || walletAddress === null || placeState.status === 'placing') {
      return;
    }
    setPlaceState({ status: 'placing' });
    const result = await source.placeComboBet(quote, {
      slippageTolerance: SLIPPAGE,
      from: walletAddress,
    });
    setPlaceState(
      result.ok
        ? {
            status: 'done',
            reference: result.data.reference,
            explorerUrl: result.data.explorerUrl,
          }
        : { status: 'error', error: result.error },
    );
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
        {selections.map((s) => {
          const outcome = s.market.outcomes.find((o) => o.id === s.outcomeId);
          return (
            <div
              key={s.market.id}
              className="rounded-xl bg-[#0f121a] border border-neutral-800 px-3 py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-wide text-neutral-500 truncate">
                  {s.eventTitle}
                </p>
                <p className="text-xs font-semibold text-neutral-100 truncate">
                  {outcome?.label ?? '—'}
                  <span className="text-neutral-500 font-normal">
                    {' '}
                    · {optionLabelOf(s.market)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <OddsTag market={s.market} outcomeId={s.outcomeId} />
                <button
                  onClick={() => removeSelection(s.market.id)}
                  title="Quitar del boleto"
                  className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-600 hover:text-neutral-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-neutral-800 bg-[#0d1017] flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-neutral-500">
            Cuota combinada ({selections.length} patas)
          </span>
          <span className="text-emerald-300 font-bold">
            {quote !== null
              ? Number(quote.totalOdds).toFixed(2)
              : previewOdds !== null
                ? `≈ ${previewOdds.toFixed(2)}`
                : '—'}
          </span>
        </div>

        {placeState.status === 'done' ? (
          <div className="rounded-xl border p-3 flex flex-col gap-1.5 text-[11px] bg-emerald-500/10 border-emerald-500/25 text-emerald-300">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Combinada apostada · ref {placeState.reference}
            </span>
            {placeState.explorerUrl !== null && (
              <a
                href={placeState.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:underline font-mono"
              >
                <ExternalLink className="w-3 h-3" /> Ver en el explorador
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Importe total"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={placeState.status === 'placing'}
                className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-xs font-mono font-bold text-neutral-100 disabled:opacity-50"
              />
              <span className="text-[11px] font-mono text-neutral-500 w-28 text-right shrink-0">
                {quoteState.status === 'loading' ? (
                  'cotizando…'
                ) : quote !== null ? (
                  <span className="text-emerald-400">
                    → {formatCurrency(Number(quote.expectedPayout))}
                  </span>
                ) : (
                  'gana —'
                )}
              </span>
            </div>

            {quoteState.status === 'error' && (
              <p className="text-[10px] text-amber-300">
                {quoteState.error.message}
              </p>
            )}
            {placeState.status === 'error' && (
              <p className="text-[10px] text-rose-300">
                {placeState.error.message}
              </p>
            )}
            {!walletConnected && (
              <button
                onClick={onConnectWallet}
                className="w-full py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-[11px] font-bold text-amber-300 transition-colors flex items-center justify-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Conecta tu wallet para apostar
              </button>
            )}
            <button
              onClick={place}
              disabled={quote === null || !walletConnected || placeState.status === 'placing'}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-98 flex items-center justify-center gap-2 ${
                quote === null || !walletConnected || placeState.status === 'placing'
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black'
              }`}
            >
              {placeState.status === 'placing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Firmando la combinada…</span>
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  <span>Apostar combinada</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-center text-neutral-600 leading-relaxed">
              Una sola apuesta y una sola firma: el pago exige acertar todas
              las selecciones.
            </p>
          </>
        )}
      </div>
    </>
  );
};

/**
 * Una selección del boleto: cotiza sola al escribir el importe y expone su
 * `place()` para la tanda. Errores tipados en línea, nunca excepciones.
 */
const SlipItem: React.FC<{
  selection: BetSlipSelection;
  registry: Map<string, SlipItemApi>;
  walletAddress: string | null;
  /** Avisa al boleto de que la disponibilidad de esta fila cambió. */
  onChanged: () => void;
}> = ({ selection, registry, walletAddress, onChanged }) => {
  const { market, outcomeId, eventTitle } = selection;
  const [amount, setAmount] = useState('');
  const [quoteState, setQuoteState] = useState<ItemQuoteState>({ status: 'idle' });
  const [placeState, setPlaceState] = useState<ItemPlaceState>({ status: 'idle' });

  const source = marketSources.sourceFor(market.id);
  const outcome = market.outcomes.find((o) => o.id === outcomeId) ?? null;

  // Cotización con retardo, una petición por pausa de tecleo.
  useEffect(() => {
    if (placeState.status === 'done') return;
    if (source === null || !isValidAmount(amount)) {
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
  }, [source, market.id, outcomeId, amount, placeState.status]);

  useEffect(() => {
    onChanged();
  }, [quoteState.status, placeState.status, onChanged]);

  const quoteRef = useRef<ItemQuoteState>(quoteState);
  quoteRef.current = quoteState;
  const placeRef = useRef<ItemPlaceState>(placeState);
  placeRef.current = placeState;
  const walletRef = useRef(walletAddress);
  walletRef.current = walletAddress;

  // Registro para "Apostar todo": el padre dispara, la fila ejecuta.
  useEffect(() => {
    registry.set(market.id, {
      isReady: () =>
        quoteRef.current.status === 'ok' &&
        placeRef.current.status !== 'done' &&
        placeRef.current.status !== 'placing' &&
        source !== null &&
        source.capabilities.canPlaceBet,
      place: async () => {
        const quote = quoteRef.current;
        const from = walletRef.current;
        if (quote.status !== 'ok' || source === null || from === null) return;
        setPlaceState({ status: 'placing' });
        const result = await source.placeBet(quote.quote, {
          slippageTolerance: SLIPPAGE,
          from,
        });
        setPlaceState(
          result.ok
            ? {
                status: 'done',
                reference: result.data.reference,
                explorerUrl: result.data.explorerUrl,
              }
            : { status: 'error', error: result.error },
        );
      },
    });
    return () => void registry.delete(market.id);
  }, [registry, market.id, source]);

  const quote = quoteState.status === 'ok' ? quoteState.quote : null;
  const payout = quote === null ? null : Number(quote.expectedPayout);

  return (
    <div className="rounded-xl bg-[#0f121a] border border-neutral-800 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wide text-neutral-500 truncate">
            {eventTitle}
          </p>
          <p className="text-xs font-semibold text-neutral-100 leading-snug">
            {outcome?.label ?? '—'}
            <span className="text-neutral-500 font-normal">
              {' '}
              · {optionLabelOf(market)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <OddsTag market={market} outcomeId={outcomeId} />
          <button
            onClick={() => removeSelection(market.id)}
            title="Quitar del boleto"
            className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-600 hover:text-neutral-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {placeState.status === 'done' ? (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Apostada · ref {placeState.reference}</span>
          {placeState.explorerUrl !== null && (
            <a
              href={placeState.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 hover:text-emerald-200"
              title="Ver en el explorador"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Importe"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={placeState.status === 'placing'}
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-xs font-mono font-bold text-neutral-100 disabled:opacity-50"
            />
            <span className="text-[10px] font-mono text-neutral-500 w-24 text-right shrink-0">
              {placeState.status === 'placing' ? (
                <span className="flex items-center justify-end gap-1 text-neutral-300">
                  <Loader2 className="w-3 h-3 animate-spin" /> firmando…
                </span>
              ) : quoteState.status === 'loading' ? (
                'cotizando…'
              ) : payout !== null ? (
                <span className="text-emerald-400">
                  → {formatCurrency(payout)}
                </span>
              ) : (
                'gana —'
              )}
            </span>
          </div>

          {quoteState.status === 'error' && (
            <p className="text-[10px] text-amber-300">
              {quoteState.error.message}
            </p>
          )}
          {placeState.status === 'error' && (
            <p className="text-[10px] text-rose-300">
              {placeState.error.message}
            </p>
          )}
          {source !== null && !source.capabilities.canPlaceBet && (
            <p className="text-[10px] text-amber-300">
              Este despliegue no tiene credenciales para apostar en{' '}
              {source.displayName}.
            </p>
          )}
          {!market.isQuotable && (
            <p className="text-[10px] text-amber-300">
              Este mercado no acepta apuestas ahora mismo.
            </p>
          )}
        </>
      )}
    </div>
  );
};

/** Cuota de la selección: decimal en venues de cuotas, % en el resto. */
const OddsTag: React.FC<{ market: Market; outcomeId: string }> = ({
  market,
  outcomeId,
}) => {
  const outcome = market.outcomes.find((o) => o.id === outcomeId);
  const text =
    outcome === undefined
      ? '—'
      : market.priceFormat === 'decimal-odds' && outcome.price !== null
        ? Number(outcome.price).toFixed(2)
        : outcome.probability !== null
          ? `${Math.round(outcome.probability * 100)}%`
          : '—';
  return (
    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono font-bold text-emerald-300">
      {text}
    </span>
  );
};
