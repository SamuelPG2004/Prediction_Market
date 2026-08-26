import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ExternalLink,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { useApprovals, useOnchainAccount } from '../hooks/useOnchainAccount';
import { txUrl } from '../config/polymarket';
import { formatCurrency } from '../utils/formatters';

interface ApprovalsPanelProps {
  /** Si el mercado con el que vas a operar es negRisk. */
  negRisk: boolean;
}

/**
 * Aprobaciones on-chain necesarias para operar.
 *
 * Son transacciones reales que firmas tú y cuestan gas (céntimos en Polygon).
 * Hacen falta las dos:
 *   - USDC: el exchange puede tomar tu colateral cuando una orden se llena.
 *   - Shares (ERC1155): el exchange puede entregar tus shares al vender.
 *
 * Deliberadamente NO se aprueba un importe infinito. Se pide una cantidad
 * concreta, porque una aprobación ilimitada sigue viva mucho después de que
 * dejes de usar la app.
 */
export const ApprovalsPanel: React.FC<ApprovalsPanelProps> = ({ negRisk }) => {
  const account = useOnchainAccount();
  const { approveUsdc, setSharesApproval, isPending } = useApprovals();

  const [amount, setAmount] = useState('100');
  const [busy, setBusy] = useState<'usdc' | 'shares' | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usdcAllowance = negRisk
    ? account.usdcAllowanceNegRisk
    : account.usdcAllowance;
  const sharesOk = negRisk
    ? account.sharesApprovedNegRisk
    : account.sharesApproved;

  const run = async (kind: 'usdc' | 'shares') => {
    setBusy(kind);
    setError(null);
    setLastTx(null);
    try {
      const hash =
        kind === 'usdc'
          ? await approveUsdc(parseFloat(amount) || 0, negRisk)
          : await setSharesApproval(true, negRisk);
      setLastTx(hash);
      // Da un momento a que el nodo indexe antes de releer.
      window.setTimeout(() => account.refetch(), 3000);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'shortMessage' in e
          ? String((e as { shortMessage: unknown }).shortMessage)
          : e instanceof Error
            ? e.message
            : 'La transacción falló.';
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  if (!account.isConnected) return null;

  const allReady = usdcAllowance > 0 && sharesOk;

  return (
    <div className="rounded-2xl bg-[#0f121a] border border-neutral-800 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {allReady ? (
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          )}
          <h3 className="text-sm font-bold text-neutral-100">
            Permisos on-chain
          </h3>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
          {negRisk ? 'negRisk' : 'estándar'}
        </span>
      </div>

      {/* USDC */}
      <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-300">
            1. Gasto de USDC
          </span>
          {usdcAllowance > 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              {formatCurrency(usdcAllowance)}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-amber-400">
              sin aprobar
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-xs">
              $
            </span>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-7 pr-3 py-2 rounded-lg bg-[#12151d] border border-neutral-800 focus:border-emerald-500/50 focus:outline-none text-xs font-mono text-neutral-100"
            />
          </div>
          <button
            onClick={() => run('usdc')}
            disabled={busy !== null || isPending || !(parseFloat(amount) > 0)}
            className="px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
          >
            {busy === 'usdc' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            <span>Aprobar</span>
          </button>
        </div>
        <p className="text-[10px] text-neutral-500 leading-relaxed">
          Cantidad exacta, no ilimitada. Tendrás que volver a aprobar cuando se
          agote.
        </p>
      </div>

      {/* Shares ERC1155 */}
      <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-300">
            2. Transferencia de shares
          </span>
          {sharesOk ? (
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              aprobado
            </span>
          ) : (
            <span className="text-[11px] font-mono text-amber-400">
              sin aprobar
            </span>
          )}
        </div>

        {!sharesOk && (
          <button
            onClick={() => run('shares')}
            disabled={busy !== null || isPending}
            className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
          >
            {busy === 'shares' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            <span>Autorizar</span>
          </button>
        )}
        <p className="text-[10px] text-neutral-500 leading-relaxed">
          Necesario para vender. Sin esto las ventas fallan aunque tengas
          shares.
        </p>
      </div>

      {lastTx && (
        <a
          href={txUrl(lastTx)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          <span>Ver transacción en Polygonscan</span>
        </a>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
