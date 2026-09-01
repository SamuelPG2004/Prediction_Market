import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowLeftRight, Fuel, Loader2, X } from 'lucide-react';
import {
  BASE_CHAIN_ID,
  chainLabel,
  POLYGON_CHAIN_ID,
} from '../config/chains';
import { venueTokens } from '../services/marketSources';

const BridgeWidget = lazy(() => import('./BridgeWidget'));

/** Dirección con la que LI.FI identifica la moneda nativa de una cadena. */
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Gas nativo de cada red de venue, como destino de bridge. */
const GAS_OPTIONS = [
  { chainId: POLYGON_CHAIN_ID, symbol: 'POL' },
  { chainId: BASE_CHAIN_ID, symbol: 'ETH' },
] as const;

/** Clave del destino "gas nativo" de una red, para preseleccionarlo. */
export function gasDestinationKey(chainId: number): string {
  return `gas-${chainId}`;
}

interface DestinationOption {
  key: string;
  title: string;
  subtitle: string;
  chainId: number;
  tokenAddress: string;
}

interface BridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Destino a preseleccionar al abrir (clave de venue o de gas). */
  initialDestination?: string;
}

/**
 * Modal de "traer fondos": aloja el widget de LI.FI con el destino
 * preseleccionado. Los destinos son los tokens de apuesta de cada venue
 * (salen de `venueTokens`, así que un tercer venue aparecería aquí solo)
 * más el gas nativo de cada red, para reponer POL/ETH sin salir de la app.
 *
 * El widget se carga en diferido: su chunk no penaliza el arranque de la app
 * y solo se descarga la primera vez que se abre este modal.
 */
export const BridgeModal: React.FC<BridgeModalProps> = ({
  isOpen,
  onClose,
  initialDestination,
}) => {
  const destinations: DestinationOption[] = [
    ...venueTokens.map((t) => ({
      key: t.venue,
      title: t.displayName,
      subtitle: `${t.symbol} · ${chainLabel(t.chainId)}`,
      chainId: t.chainId,
      tokenAddress: t.address as string,
    })),
    ...GAS_OPTIONS.map((g) => ({
      key: gasDestinationKey(g.chainId),
      title: `Gas · ${chainLabel(g.chainId)}`,
      subtitle: `${g.symbol} nativo`,
      chainId: g.chainId,
      tokenAddress: NATIVE_TOKEN_ADDRESS,
    })),
  ];

  const [selectedKey, setSelectedKey] = useState(destinations[0]?.key ?? '');

  // El modal no se desmonta al cerrarse: el preajuste debe aplicarse en cada
  // apertura, no solo en el primer render.
  useEffect(() => {
    if (isOpen && initialDestination !== undefined) {
      setSelectedKey(initialDestination);
    }
  }, [isOpen, initialDestination]);

  if (!isOpen) return null;

  const selected =
    destinations.find((d) => d.key === selectedKey) ?? destinations[0];
  if (selected === undefined) return null;
  const destinationChainIds = [...new Set(destinations.map((d) => d.chainId))];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md rounded-2xl bg-[#0f121a] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-150 my-8">
        {/* Cabecera */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-[#131620]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">Traer fondos</h3>
              <p className="text-[11px] text-neutral-400">
                Desde BNB Chain u otra red · firmas cada paso
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Destino: token de apuesta por venue, o gas nativo por red */}
        <div className="p-4 pb-0 flex flex-col gap-2">
          <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
            ¿Qué quieres traer?
          </span>
          <div className="grid grid-cols-2 gap-2">
            {destinations.map((option) => {
              const isActive = option.key === selected.key;
              const isGas = option.tokenAddress === NATIVE_TOKEN_ADDRESS;
              return (
                <button
                  key={option.key}
                  onClick={() => setSelectedKey(option.key)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all active:scale-98 ${
                    isActive
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    {isGas && <Fuel className="w-3 h-3" />}
                    {option.title}
                  </span>
                  <span className="block text-[11px] font-mono mt-0.5">
                    {option.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* El widget gestiona ruta, cotización y transacciones; remontarlo al
            cambiar de destino es la forma soportada de cambiar sus defaults. */}
        <Suspense
          fallback={
            <div className="h-[420px] flex flex-col items-center justify-center gap-3 text-neutral-500">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">Cargando el módulo de bridge…</span>
            </div>
          }
        >
          <BridgeWidget
            key={selected.key}
            destination={{ chainId: selected.chainId, tokenAddress: selected.tokenAddress }}
            allowedDestinationChainIds={destinationChainIds}
          />
        </Suspense>

        <p className="px-5 pb-4 text-[11px] text-neutral-500 leading-relaxed">
          El enrutado lo hace LI.FI (el motor de Jumper). La app nunca mueve
          fondos sola: cada aprobación y transacción la confirmas tú en tu
          wallet. Necesitarás algo de BNB para el gas de salida. Para el gas
          de destino bastan 1–2 € de POL o ETH: dan para meses de operaciones.
        </p>
      </div>
    </div>
  );
};
