import React from 'react';
import { Fuel } from 'lucide-react';
import { formatUnits } from 'viem';
import { useAccount, useBalance } from 'wagmi';
import { BASE_CHAIN_ID, chainLabel, POLYGON_CHAIN_ID } from '../config/chains';
import { useVenueBalances } from '../hooks/useVenueBalances';

/**
 * Umbral por red bajo el cual avisamos. Holgados a propósito: cubren un
 * puñado de aprobaciones/cobros, que es cuando el gas de verdad hace falta.
 */
const GAS_THRESHOLDS = [
  { chainId: POLYGON_CHAIN_ID, symbol: 'POL', min: 0.5 },
  { chainId: BASE_CHAIN_ID, symbol: 'ETH', min: 0.0001 },
] as const;

/**
 * Aviso de gas nativo bajo, con acceso directo al bridge preseleccionado.
 * Solo avisa de una red si HAY saldo de apuesta en ella: una wallet sin
 * fondos no necesita gas todavía, y darle la lata antes de depositar sobra.
 * Tampoco avisa mientras los saldos cargan: nada de falsas alarmas.
 */
export const LowGasBanner: React.FC<{ onGetGas: (chainId: number) => void }> = ({
  onGetGas,
}) => {
  const { address, isConnected } = useAccount();
  const pol = useBalance({ address, chainId: POLYGON_CHAIN_ID });
  const eth = useBalance({ address, chainId: BASE_CHAIN_ID });
  const { balances } = useVenueBalances();

  if (!isConnected) return null;

  const lacking = GAS_THRESHOLDS.filter((t) => {
    const gasData = t.chainId === POLYGON_CHAIN_ID ? pol.data : eth.data;
    if (gasData === undefined) return false;
    const gas = Number(formatUnits(gasData.value, gasData.decimals));
    const betToken =
      balances.find((b) => b.chainId === t.chainId)?.balance ?? null;
    return betToken !== null && betToken > 0 && gas < t.min;
  });

  if (lacking.length === 0) return null;

  return (
    <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
      <p className="flex-1 flex items-center gap-2 text-[11px] text-amber-200/90">
        <Fuel className="w-3.5 h-3.5 shrink-0 text-amber-400" />
        <span>
          Poco gas en {lacking.map((t) => chainLabel(t.chainId)).join(' y ')}:
          sin él, las aprobaciones y los cobros de premios fallarán.
        </span>
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {lacking.map((t) => (
          <button
            key={t.chainId}
            onClick={() => onGetGas(t.chainId)}
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-[11px] font-bold text-amber-300 transition-all active:scale-95"
          >
            Conseguir {t.symbol}
          </button>
        ))}
      </div>
    </div>
  );
};
