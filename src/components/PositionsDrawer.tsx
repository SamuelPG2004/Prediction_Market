import React, { useCallback, useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle, Layers, RefreshCw } from 'lucide-react';
import type { Position } from '../domain/types';
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

  const load = useCallback(async () => {
    if (wallet.address === null) {
      setFeeds(null);
      return;
    }
    setIsLoading(true);
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
        const result = await source.getPositions(wallet.address!);
        return {
          venue: source.venue,
          displayName: source.displayName,
          positions: result.ok ? result.data : [],
          error: result.ok ? null : result.error.message,
          unsupported: !result.ok && result.error.kind === 'unsupported',
        };
      }),
    );
    setFeeds(results);
    setIsLoading(false);
  }, [wallet.address]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const total = feeds?.reduce((a, f) => a + f.positions.length, 0) ?? 0;

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
              <h3 className="text-sm font-bold text-neutral-100">
                Mis posiciones reales
              </h3>
              <p className="text-[11px] text-neutral-400">
                {total} {total === 1 ? 'posición' : 'posiciones'}
              </p>
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
          {wallet.address === null ? (
            <p className="text-xs text-neutral-400 p-2">
              Conecta tu wallet para ver tus posiciones.
            </p>
          ) : isLoading && feeds === null ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              <p className="text-xs text-neutral-500 font-mono">
                Consultando venues…
              </p>
            </div>
          ) : (
            feeds?.map((feed) => (
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
                    Sin posiciones en {feed.displayName}.
                  </p>
                ) : (
                  feed.positions.map((p, i) => (
                    <PositionCard key={`${p.marketId}:${p.outcomeId}:${i}`} position={p} />
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

const PositionCard: React.FC<{ position: Position }> = ({ position }) => {
  const status = STATUS_LABEL[position.status];
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

      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
        <div>
          <div className="text-neutral-600 text-[9px] uppercase">Resultado</div>
          <div className="text-neutral-300 truncate">{position.outcomeLabel}</div>
        </div>
        <div>
          <div className="text-neutral-600 text-[9px] uppercase">Apostado</div>
          <div className="text-neutral-200">
            {formatCurrency(Number(position.stake))}
          </div>
        </div>
        <div>
          <div className="text-neutral-600 text-[9px] uppercase">Si acierta</div>
          <div className="text-emerald-400">
            {formatCurrency(Number(position.potentialPayout))}
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
          <span>{position.openedAt.toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
};
