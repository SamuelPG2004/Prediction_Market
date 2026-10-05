import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  Loader2,
  AlertTriangle,
  Banknote,
  Layers,
  RefreshCw,
  Coins,
  ExternalLink,
} from 'lucide-react';
import type {
  CashoutOffer,
  CashoutReceipt,
  Position,
  RedeemProgress,
  RedeemReceipt,
  Result,
} from '../domain/types';
import { marketSources } from '../services/marketSources';
import { useWallet } from '../services/web3Service';
import { formatCurrency } from '../utils/formatters';

interface PositionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface VenuePositions {
  venue: string;
  displayName: string;
  positions: Position[];
  /** Error legible, o null. `unsupported` se trata aparte. */
  error: string | null;
  unsupported: boolean;
}

const STATUS_LABEL: Record<Position['status'], { text: string; tone: string }> = {
  open: { text: 'Abierta', tone: 'bg-neutral-800 text-neutral-300' },
  won: { text: 'Ganada', tone: 'bg-emerald-500/15 text-emerald-300' },
  lost: { text: 'Perdida', tone: 'bg-rose-500/15 text-rose-300' },
  redeemable: { text: 'Cobrable', tone: 'bg-emerald-500/15 text-emerald-300' },
  redeemed: { text: 'Cobrada', tone: 'bg-neutral-800 text-neutral-400' },
};

type PositionTab = 'open' | 'history';

/**
 * Cartera real: posiciones de cada venue registrado, vía el puerto del
 * dominio. Los venues sin soporte o sin credenciales se listan como tales en
 * vez de ocultarse: que se vea por qué no hay datos.
 */
export const PositionsDrawer: React.FC<PositionsDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const wallet = useWallet();
  const [feeds, setFeeds] = useState<VenuePositions[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const walletAddressRef = useRef(wallet.address);
  walletAddressRef.current = wallet.address;
  const loadingAddressRef = useRef<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [tab, setTab] = useState<PositionTab>('open');
  const [redeemedReferences, setRedeemedReferences] = useState<Record<string, { reference: string; explorerUrl: string | null }>>({});

  const load = useCallback(async () => {
    const address = wallet.address;
    if (address === null) {
      setFeeds(null);
      return;
    }
    if (loadingAddressRef.current === address) return;
    loadingAddressRef.current = address;
    setIsLoading(true);
    try {
      const results = await Promise.all(
        marketSources.sources.map(async (source): Promise<VenuePositions> => {
          if (!source.capabilities.canReadPositions) {
            return {
              venue: source.venue,
              displayName: source.displayName,
              positions: [],
              error: null,
              unsupported: true,
            };
          }
          const result = await source.getPositions(address);
          return {
            venue: source.venue,
            displayName: source.displayName,
            positions: result.ok ? result.data : [],
            error: result.ok ? null : result.error.message,
            unsupported: !result.ok && result.error.kind === 'unsupported',
          };
        }),
      );
      if (walletAddressRef.current === address) {
        setFeeds(results);
        setUpdatedAt(new Date());
      }
    } finally {
      if (loadingAddressRef.current === address) {
        loadingAddressRef.current = null;
        setIsLoading(false);
      }
    }
  }, [wallet.address]);

  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => {
      if (!document.hidden) void load();
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isOpen, load]);

  if (!isOpen) return null;

  const total = feeds?.reduce((a, f) => a + f.positions.length, 0) ?? 0;
  const openPositions = feeds?.flatMap((feed) => feed.positions).filter((position) => position.status === 'open') ?? [];
  const openStake = openPositions.reduce((sum, position) => sum + Number(position.stake), 0);
  const pricedOpenPositions = openPositions.filter((position) => position.currentValue !== null);
  const openValue = pricedOpenPositions.reduce((sum, position) => sum + Number(position.currentValue), 0);
  const openPnl = pricedOpenPositions.length === openPositions.length ? openValue - openStake : null;
  const redeemableCount = feeds?.flatMap((feed) => feed.positions).filter((position) => position.status === 'redeemable').length ?? 0;
  const allPositions = feeds?.flatMap((feed) => feed.positions) ?? [];
  const historyCount = allPositions.filter((position) => position.status !== 'open').length;
  const filteredFeeds = feeds?.map((feed) => ({
    ...feed,
    positions: feed.positions.filter((position) =>
      tab === 'open' ? position.status === 'open' : position.status !== 'open',
    ),
  }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md h-full bg-[#0b0d13] border-l border-neutral-800 shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Cabecera */}
        <div className="p-5 border-b border-neutral-800 bg-[#101420] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">Mis apuestas</h3>
              <p className="text-[11px] text-neutral-400">
                {total} {total === 1 ? 'ticket' : 'tickets'} · abiertas {formatCurrency(openStake)}
              </p>
              {updatedAt !== null && <p className="text-[10px] text-neutral-600">Actualizado {updatedAt.toLocaleTimeString()}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void load()}
              disabled={isLoading}
              title="Recargar"
              className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {wallet.address !== null && (
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-neutral-800 bg-[#0d1017] p-1" role="tablist" aria-label="Mis apuestas">
              {([
                ['open', `Abiertos · ${openPositions.length}`],
                ['history', `Historial · ${historyCount}${redeemableCount > 0 ? ` · ${redeemableCount} cobrables` : ''}`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${tab === key ? 'bg-emerald-500/15 text-emerald-300' : 'text-neutral-400 hover:text-neutral-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {wallet.address !== null && tab === 'open' && openPositions.length > 0 && (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-800 bg-[#0d1017] p-3 text-[11px]">
              <div>
                <p className="text-[9px] uppercase text-neutral-500">Valor actual</p>
                <p className="mt-1 font-mono text-neutral-200">{formatCurrency(openValue)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-neutral-500">P/G abierta estimada</p>
                <p className={`mt-1 font-mono ${openPnl === null ? 'text-neutral-500' : openPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {openPnl === null ? 'Datos incompletos' : `${openPnl > 0 ? '+' : ''}${formatCurrency(openPnl)}`}
                </p>
              </div>
            </div>
          )}
          {wallet.address === null ? (
            <p className="text-xs text-neutral-400 p-2">
              Inicia sesión para ver tus posiciones.
            </p>
          ) : isLoading && feeds === null ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              <p className="text-xs text-neutral-500 font-mono">
                Consultando venues…
              </p>
            </div>
          ) : (
            filteredFeeds?.map((feed) => (
              <div key={feed.venue} className="flex flex-col gap-2">
                <h4 className="text-[10px] uppercase font-mono text-neutral-500 tracking-widest">
                  {feed.displayName}
                </h4>

                {feed.unsupported ? (
                  <p className="text-[11px] text-neutral-500 rounded-xl bg-[#0d1017] border border-dashed border-neutral-800 p-3">
                    Sin credenciales configuradas para leer posiciones de{' '}
                    {feed.displayName}.
                  </p>
                ) : feed.error !== null ? (
                  <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 p-3 text-[11px] text-rose-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{feed.error}</span>
                  </div>
                ) : feed.positions.length === 0 ? (
                  <p className="text-[11px] text-neutral-600 px-1">
                    {allPositions.length === 0 ? `Sin posiciones en ${feed.displayName}.` : 'No hay posiciones en este filtro.'}
                  </p>
                ) : (
                  feed.positions.map((p) => (
                    <PositionCard
                      key={p.id}
                      position={p}
                      venueName={feed.displayName}
                      onRedeem={redeemerFor(feed.venue, wallet.address)}
                      cashouter={cashouterFor(feed.venue, wallet.address)}
                      redeemedReceipt={redeemedReferences[p.id] ?? null}
                      onActionComplete={(positionId, receipt) => {
                        if (receipt !== null) setRedeemedReferences((current) => ({ ...current, [positionId]: receipt }));
                        void load();
                      }}
                    />
                  ))
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

type Redeemer = (
  position: Position,
  onProgress: (progress: RedeemProgress) => void,
) => Promise<Result<RedeemReceipt>>;

/**
 * Cobrador para las posiciones de un venue, o null si no aplica (el venue no
 * sabe cobrar, o no hay wallet). Cada posición 'redeemable' lo usa en su botón.
 */
function redeemerFor(venue: string, address: string | null): Redeemer | null {
  const source = marketSources.byVenue(venue);
  if (source === null || !source.capabilities.canRedeem || address === null) {
    return null;
  }
  return (position, onProgress) =>
    source.redeemPosition(position, { from: address, onProgress });
}

interface Cashouter {
  getOffer: (position: Position) => Promise<Result<CashoutOffer | null>>;
  execute: (offer: CashoutOffer) => Promise<Result<CashoutReceipt>>;
}

/**
 * Cash out para las posiciones de un venue, o null si no aplica. Solo las
 * posiciones 'open' de venues con `canCashout` ofrecen el botón; la oferta se
 * pide al pulsarlo (es firme y caduca: no tiene sentido precargarla).
 */
function cashouterFor(venue: string, address: string | null): Cashouter | null {
  const source = marketSources.byVenue(venue);
  if (source === null || !source.capabilities.canCashout || address === null) {
    return null;
  }
  return {
    getOffer: (position) => source.getCashoutOffer(position, { from: address }),
    execute: (offer) => source.cashoutPosition(offer, { from: address }),
  };
}

type RedeemState =
  | { status: 'idle' }
  | { status: 'reviewing' }
  | { status: 'pending' }
  | { status: 'confirming'; hash: string }
  | { status: 'done'; receipt: RedeemReceipt }
  | { status: 'error'; message: string };

type CashoutState =
  | { status: 'idle' }
  | { status: 'consulting' }
  | { status: 'no-offer' }
  | { status: 'offered'; offer: CashoutOffer }
  | { status: 'executing'; offer: CashoutOffer }
  | { status: 'done'; receipt: CashoutReceipt }
  | { status: 'error'; message: string };

const PositionCard: React.FC<{
  position: Position;
  venueName: string;
  onRedeem: Redeemer | null;
  cashouter: Cashouter | null;
  redeemedReceipt: { reference: string; explorerUrl: string | null } | null;
  onActionComplete: (positionId: string, receipt: { reference: string; explorerUrl: string | null } | null) => void;
}> = ({ position, venueName, onRedeem, cashouter, redeemedReceipt, onActionComplete }) => {
  const queryClient = useQueryClient();
  const [redeem, setRedeem] = useState<RedeemState>({ status: 'idle' });
  const [cashout, setCashout] = useState<CashoutState>({ status: 'idle' });

  // Tras cobrar con éxito, la tarjeta pasa a 'Cobrada' sin esperar a que el
  // indexador del venue refleje el redeemedAt (puede tardar unos segundos).
  const effectiveStatus = redeem.status === 'done' ? 'redeemed' : position.status;
  const status = STATUS_LABEL[effectiveStatus];
  const isPending = redeem.status === 'pending';
  const isConfirming = redeem.status === 'confirming';
  const isSuccess = redeem.status === 'done';

  const runRedeem = async () => {
    if (onRedeem === null || redeem.status !== 'reviewing') return;
    setRedeem({ status: 'pending' });
    const result = await onRedeem(position, (progress) => {
      if (progress.status === 'pending') setRedeem({ status: 'pending' });
      if (progress.status === 'confirming') {
        setRedeem({ status: 'confirming', hash: progress.hash });
      }
    });
    setRedeem(
      result.ok
        ? { status: 'done', receipt: result.data }
        : { status: 'error', message: result.error.message },
    );
    // El badge de cobrables del navbar sondea cada 2 min; tras un cobro debe
    // bajar ya, no en el próximo sondeo.
    if (result.ok) {
      void queryClient.invalidateQueries({ queryKey: ['redeemable-count'] });
      onActionComplete(position.id, null);
    }
  };

  const askCashoutOffer = async () => {
    if (cashouter === null || cashout.status === 'consulting') return;
    setCashout({ status: 'consulting' });
    const result = await cashouter.getOffer(position);
    if (!result.ok) {
      setCashout({ status: 'error', message: result.error.message });
    } else if (result.data === null) {
      setCashout({ status: 'no-offer' });
    } else {
      setCashout({ status: 'offered', offer: result.data });
    }
  };

  const runCashout = async () => {
    if (cashouter === null || cashout.status !== 'offered') return;
    const { offer } = cashout;
    setCashout({ status: 'executing', offer });
    const result = await cashouter.execute(offer);
    setCashout(
      result.ok
        ? { status: 'done', receipt: result.data }
        : { status: 'error', message: result.error.message },
    );
    if (result.ok) onActionComplete(position.id, { reference: result.data.reference, explorerUrl: result.data.explorerUrl });
  };

  return (
    <div className="rounded-xl bg-[#0d1017] border border-neutral-800 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold text-neutral-200 leading-snug">
          {position.marketQuestion}
        </p>
        <span
          className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${status.tone}`}
        >
          {status.text}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div>
          <div className="text-neutral-600 text-[9px] uppercase">Resultado</div>
          <div className="text-neutral-300 truncate">{position.outcomeLabel}</div>
        </div>
        <div>
          <div className="text-neutral-600 text-[9px] uppercase">Cuota aprox.</div>
          <div className="text-neutral-200">{impliedOdds(position)}</div>
        </div>
        <div>
          <div className="text-neutral-600 text-[9px] uppercase">Apostado</div>
          <div className="text-neutral-200">
            {formatCurrency(Number(position.stake))}
          </div>
        </div>
        <div>
          <div className="text-neutral-600 text-[9px] uppercase">Retorno si acierta</div>
          <div className="text-emerald-400">
            {formatCurrency(Number(position.potentialPayout))}
          </div>
        </div>
        <div>
          <div className="text-neutral-600 text-[9px] uppercase">Ganancia neta potencial</div>
          <div className="text-emerald-300">
            {formatCurrency(Number(position.potentialPayout) - Number(position.stake))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
        <span>
          {position.currentValue !== null
            ? `Valor actual ${formatCurrency(Number(position.currentValue))}`
            : 'Valor actual no disponible'}
        </span>
        {position.openedAt !== null && (
          <span>{position.openedAt.toLocaleString()}</span>
        )}
      </div>
      {position.status === 'open' && position.currentValue !== null && (
        <div className={`text-[10px] font-mono ${Number(position.currentValue) - Number(position.stake) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
          P/G no realizada: {Number(position.currentValue) - Number(position.stake) > 0 ? '+' : ''}{formatCurrency(Number(position.currentValue) - Number(position.stake))}
        </div>
      )}
      {effectiveStatus === 'open' && cashouter === null && (
        <p className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-2.5 py-2 text-[10px] leading-relaxed text-neutral-500">
          El cierre desde esta pantalla todavía no está disponible. Gestiona esta posición desde {venueName}.
        </p>
      )}

      {/* Cobro: solo posiciones cobrables de venues que saben cobrar. */}
      {effectiveStatus === 'redeemable' && onRedeem !== null && (
        redeem.status === 'reviewing' || isPending || isConfirming ? (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5 flex flex-col gap-2">
            <p className="text-[11px] text-neutral-200">Premio a cobrar: <strong className="font-mono text-emerald-300">{formatCurrency(Number(position.potentialPayout))}</strong></p>
            <p className="text-[10px] text-neutral-500">
              {isConfirming
                ? `Transacción ${redeem.hash.slice(0, 10)}… enviada; esperando confirmación en la red.`
                : 'Se abrirá la wallet para confirmar el cobro on-chain.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => void runRedeem()} disabled={isPending || isConfirming} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500 text-black text-[11px] font-bold disabled:opacity-60">
                {isPending || isConfirming
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{isPending ? 'Esperando la wallet…' : 'Confirmando transacción…'}</>
                  : 'Confirmar cobro'}
              </button>
              {redeem.status === 'reviewing' && <button onClick={() => setRedeem({ status: 'idle' })} className="px-3 rounded-lg bg-neutral-800 text-neutral-300 text-[11px]">Volver</button>}
            </div>
          </div>
        ) : (
          <button onClick={() => setRedeem({ status: 'reviewing' })} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 transition-all active:scale-95">
            <Coins className="w-3.5 h-3.5" /><span>Cobrar {formatCurrency(Number(position.potentialPayout))}</span>
          </button>
        )
      )}
      {effectiveStatus === 'redeemable' && onRedeem === null && (
        <p className="text-[10px] text-neutral-500">Premio liquidado. El retiro desde esta app aún no está disponible para este venue.</p>
      )}

      {/* Cash out: cerrar una posición abierta al precio que ofrezca el venue
          ahora. La oferta se pide al pulsar (es firme y caduca). */}
      {effectiveStatus === 'open' &&
        cashouter !== null &&
        cashout.status !== 'done' && (
          <>
            {(cashout.status === 'idle' || cashout.status === 'error') && (
              <button
                onClick={() => void askCashoutOffer()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 text-[11px] font-bold text-neutral-300 hover:text-neutral-100 transition-all active:scale-95"
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>Cash out · consultar oferta</span>
              </button>
            )}
            {cashout.status === 'consulting' && (
              <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-neutral-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Pidiendo oferta…</span>
              </div>
            )}
            {cashout.status === 'no-offer' && (
              <p className="text-[11px] text-neutral-500 rounded-lg bg-neutral-900/60 border border-dashed border-neutral-800 p-2.5">
                Cash out cierra una apuesta abierta; Azuro no ofrece un precio para cerrarla ahora. Esto no afecta a premios ya liquidados.
              </p>
            )}
            {(cashout.status === 'offered' || cashout.status === 'executing') && (
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/25 p-2.5 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-neutral-300">
                  Te ofrecen{' '}
                  <span className="font-mono font-bold text-emerald-300">
                    {formatCurrency(Number(cashout.offer.amount))}
                  </span>{' '}
                  por cerrar ya
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => void runCashout()}
                    disabled={cashout.status === 'executing'}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-all active:scale-95 disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {cashout.status === 'executing' ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Firmando…</span>
                      </>
                    ) : (
                      <span>Aceptar</span>
                    )}
                  </button>
                  {cashout.status === 'offered' && (
                    <button
                      onClick={() => setCashout({ status: 'idle' })}
                      className="px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                    >
                      No
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

      {cashout.status === 'done' && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-2.5 text-[11px] text-emerald-300">
          <span>
            Cash out enviado por{' '}
            {formatCurrency(Number(cashout.receipt.amount))} · ref{' '}
            <span className="font-mono">{cashout.receipt.reference}</span>
          </span>
        </div>
      )}

      {cashout.status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{cashout.message}</span>
        </div>
      )}

      {redeem.status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{redeem.message}</span>
        </div>
      )}

      {isSuccess && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-2.5 text-[11px] text-emerald-300">
          <span>Reclamo enviado a la red. Espera la confirmación de la transacción.</span>
          {redeem.receipt.explorerUrl !== null && (
            <a
              href={redeem.receipt.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Ver la transacción en el explorador"
              className="p-1 rounded hover:bg-emerald-500/20 shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
};

function impliedOdds(position: Position): string {
  const stake = Number(position.stake);
  const payout = Number(position.potentialPayout);
  if (!Number.isFinite(stake) || !Number.isFinite(payout) || stake <= 0) return '—';
  return `${(payout / stake).toFixed(2)}×`;
}
