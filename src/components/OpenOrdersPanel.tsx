import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, X, Inbox, AlertTriangle } from 'lucide-react';
import { useClobTrading } from '../hooks/useClobTrading';
import { formatCurrency } from '../utils/formatters';

interface OpenOrdersPanelProps {
  /** Se llama tras cancelar, para refrescar saldos y libro. */
  onChanged?: () => void;
}

interface OpenOrderRow {
  id: string;
  asset_id?: string;
  side?: string;
  price?: string | number;
  original_size?: string | number;
  size_matched?: string | number;
  market?: string;
  outcome?: string;
}

/**
 * Órdenes propias aún vivas en el libro, con opción de cancelar.
 *
 * Es imprescindible para operar con órdenes límite: una orden límite que no
 * cruza el spread NO se llena, se queda esperando. Sin esta vista firmarías
 * una orden y no sabrías si se ejecutó, si está pendiente, o si el operador la
 * rechazó, y tendrías capital comprometido sin forma de recuperarlo.
 *
 * Requiere autenticación en el CLOB, así que pide una firma la primera vez.
 */
export const OpenOrdersPanel: React.FC<OpenOrdersPanelProps> = ({
  onChanged,
}) => {
  const trading = useClobTrading();
  const [orders, setOrders] = useState<OpenOrderRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await trading.getOpenOrders();
      // La respuesta puede venir como array o envuelta; se normaliza.
      const list: OpenOrderRow[] = Array.isArray(res)
        ? (res as OpenOrderRow[])
        : ((res as { data?: OpenOrderRow[] })?.data ?? []);
      setOrders(list);
      setLoadedOnce(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudieron leer las órdenes.',
      );
    } finally {
      setLoading(false);
    }
  }, [trading]);

  // Refresca solo si ya se autenticó una vez: no queremos disparar una
  // petición de firma sin que el usuario lo pida.
  useEffect(() => {
    if (!loadedOnce) return;
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [loadedOnce, load]);

  const cancel = async (orderId: string) => {
    setCancelling(orderId);
    setError(null);
    try {
      await trading.cancelOrder(orderId);
      await load();
      onChanged?.();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo cancelar la orden.',
      );
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="rounded-2xl bg-[#0f121a] border border-neutral-800 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-neutral-100">Órdenes abiertas</h3>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] font-semibold text-neutral-400 hover:text-neutral-200 transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          <span>{loadedOnce ? 'Refrescar' : 'Consultar'}</span>
        </button>
      </div>

      {!loadedOnce && !loading && !error && (
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          Consultar tus órdenes requiere autenticarte en el CLOB. Se te pedirá
          una firma (no cuesta gas).
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {orders && orders.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-5 text-neutral-600">
          <Inbox className="w-6 h-6" />
          <span className="text-[11px]">Ninguna orden pendiente.</span>
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="flex flex-col gap-2">
          {orders.map((o) => {
            const price = Number(o.price ?? 0);
            const total = Number(o.original_size ?? 0);
            const matched = Number(o.size_matched ?? 0);
            const pct = total > 0 ? (matched / total) * 100 : 0;

            return (
              <div
                key={o.id}
                className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                          String(o.side).toUpperCase() === 'BUY'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {o.side ?? '?'}
                      </span>
                      {o.outcome && (
                        <span className="text-[11px] text-neutral-300">
                          {o.outcome}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-neutral-600 truncate">
                      {o.id}
                    </span>
                  </div>

                  <button
                    onClick={() => cancel(o.id)}
                    disabled={cancelling !== null}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-[11px] font-semibold text-rose-300 transition-all shrink-0 disabled:opacity-50"
                  >
                    {cancelling === o.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                    <span>Cancelar</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span>${price.toFixed(3)} / share</span>
                  <span>
                    {matched.toFixed(0)} / {total.toFixed(0)} shares
                  </span>
                  <span className="text-neutral-500">
                    {formatCurrency(price * total)}
                  </span>
                </div>

                {/* Progreso de llenado */}
                <div className="relative w-full h-1 rounded-full bg-neutral-900 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
