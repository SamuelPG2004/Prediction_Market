import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { useAccount, useChainId, useSwitchChain, useWalletClient } from 'wagmi';
import { POLYGON_CHAIN_ID } from '../config/polymarket';
import { useOnchainAccount } from '../hooks/useOnchainAccount';
import { formatCurrency } from '../utils/formatters';

interface PreflightChecklistProps {
  /** Si el mercado objetivo es negRisk (cambia qué aprobación cuenta). */
  negRisk: boolean;
  /** Importe en USDC que se pretende gastar, para validar saldo y allowance. */
  plannedSpendUsd: number;
  onConnectClick: () => void;
}

type CheckState = 'ok' | 'fail' | 'pending';

interface Check {
  label: string;
  state: CheckState;
  detail: string;
  action?: { label: string; run: () => void };
}

/**
 * Lista de comprobaciones previas a una operación real.
 *
 * Existe porque en el camino a firmar una orden hay cinco cosas que pueden
 * estar mal y el mensaje de error del CLOB no distingue entre ellas. Verlas
 * todas de golpe convierte un "rechazado" opaco en algo accionable.
 */
export const PreflightChecklist: React.FC<PreflightChecklistProps> = ({
  negRisk,
  plannedSpendUsd,
  onConnectClick,
}) => {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const account = useOnchainAccount();

  // Sin la wallet en Polygon, wagmi no entrega WalletClient para esa cadena y
  // el SDK del CLOB no puede firmar. Es la causa nº1 de fallos confusos.
  const { data: walletClient } = useWalletClient({ chainId: POLYGON_CHAIN_ID });

  const onPolygon = chainId === POLYGON_CHAIN_ID;
  const allowance = negRisk
    ? account.usdcAllowanceNegRisk
    : account.usdcAllowance;
  const sharesOk = negRisk
    ? account.sharesApprovedNegRisk
    : account.sharesApproved;

  const checks: Check[] = [
    {
      label: 'Wallet conectada',
      state: isConnected ? 'ok' : 'fail',
      detail: isConnected ? 'Conectada' : 'Sin conectar',
      action: isConnected
        ? undefined
        : { label: 'Conectar', run: onConnectClick },
    },
    {
      label: 'Red Polygon (137)',
      state: !isConnected ? 'pending' : onPolygon ? 'ok' : 'fail',
      detail: !isConnected
        ? '—'
        : onPolygon
          ? 'Correcta'
          : `Estás en la cadena ${chainId}`,
      action:
        isConnected && !onPolygon
          ? {
              label: isSwitching ? 'Cambiando...' : 'Cambiar',
              run: () => switchChain({ chainId: POLYGON_CHAIN_ID }),
            }
          : undefined,
    },
    {
      label: 'Firmante disponible',
      state: !isConnected ? 'pending' : walletClient ? 'ok' : 'fail',
      detail: !isConnected
        ? '—'
        : walletClient
          ? 'Listo para firmar'
          : 'La wallet no expone firmante en Polygon',
    },
    {
      label: 'USDC suficiente',
      state: !isConnected
        ? 'pending'
        : account.isLoading
          ? 'pending'
          : account.usdcBalance >= plannedSpendUsd && plannedSpendUsd > 0
            ? 'ok'
            : 'fail',
      detail: !isConnected
        ? '—'
        : account.isLoading
          ? 'Leyendo...'
          : `Tienes ${formatCurrency(account.usdcBalance)}`,
    },
    {
      label: 'Allowance de USDC',
      state: !isConnected
        ? 'pending'
        : allowance >= plannedSpendUsd && plannedSpendUsd > 0
          ? 'ok'
          : 'fail',
      detail: !isConnected
        ? '—'
        : `Aprobado ${formatCurrency(allowance)}`,
    },
    {
      label: 'Aprobación de shares',
      state: !isConnected ? 'pending' : sharesOk ? 'ok' : 'fail',
      detail: !isConnected
        ? '—'
        : sharesOk
          ? 'Concedida'
          : 'Necesaria para vender',
    },
  ];

  const failing = checks.filter((c) => c.state === 'fail').length;

  return (
    <div className="rounded-2xl bg-[#0f121a] border border-neutral-800 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-neutral-100">
          Comprobaciones previas
        </h3>
        <span
          className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${
            failing === 0
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {failing === 0 ? 'todo listo' : `${failing} pendiente(s)`}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {checks.map((c) => (
          <div
            key={c.label}
            className="flex items-center gap-2 text-[11px] py-1"
          >
            {c.state === 'ok' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : c.state === 'fail' ? (
              <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
            )}

            <span className="text-neutral-300 flex-1">{c.label}</span>
            <span className="font-mono text-neutral-500 text-right">
              {c.detail}
            </span>

            {c.action && (
              <button
                onClick={c.action.run}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold transition-all shrink-0"
              >
                <span>{c.action.label}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {isConnected && !onPolygon && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 p-2.5 text-[11px] text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Los saldos se leen igual desde Polygon, pero para firmar necesitas
            que la wallet esté en esa red.
          </span>
        </div>
      )}
    </div>
  );
};
