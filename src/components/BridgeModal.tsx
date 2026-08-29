import React, { Suspense, lazy, useState } from 'react';
import { ArrowLeftRight, Loader2, X } from 'lucide-react';
import { chainLabel } from '../config/chains';
import { venueTokens } from '../services/marketSources';

const BridgeWidget = lazy(() => import('./BridgeWidget'));

interface BridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal de "traer fondos": aloja el widget de LI.FI con el destino
 * preseleccionado al token de apuesta de un venue. Los destinos salen de
 * `venueTokens` (datos neutros), así que un tercer venue aparecería aquí solo.
 *
 * El widget se carga en diferido: su chunk no penaliza el arranque de la app
 * y solo se descarga la primera vez que se abre este modal.
 */
export const BridgeModal: React.FC<BridgeModalProps> = ({ isOpen, onClose }) => {
  const [selectedVenue, setSelectedVenue] = useState(venueTokens[0]?.venue ?? '');

  if (!isOpen) return null;

  const selected =
    venueTokens.find((t) => t.venue === selectedVenue) ?? venueTokens[0];
  if (selected === undefined) return null;
  const destinationChainIds = [...new Set(venueTokens.map((t) => t.chainId))];

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

        {/* Destino: el token de apuesta de cada venue */}
        <div className="p-4 pb-0 flex flex-col gap-2">
          <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
            ¿Para apostar en qué plataforma?
          </span>
          <div className="grid grid-cols-2 gap-2">
            {venueTokens.map((token) => {
              const isActive = token.venue === selected.venue;
              return (
                <button
                  key={token.venue}
                  onClick={() => setSelectedVenue(token.venue)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all active:scale-98 ${
                    isActive
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                  }`}
                >
                  <span className="block text-xs font-bold">{token.displayName}</span>
                  <span className="block text-[11px] font-mono mt-0.5">
                    {token.symbol} · {chainLabel(token.chainId)}
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
            key={selected.venue}
            destination={{ chainId: selected.chainId, tokenAddress: selected.address }}
            allowedDestinationChainIds={destinationChainIds}
          />
        </Suspense>

        <p className="px-5 pb-4 text-[11px] text-neutral-500 leading-relaxed">
          El enrutado lo hace LI.FI (el motor de Jumper). La app nunca mueve
          fondos sola: cada aprobación y transacción la confirmas tú en tu
          wallet. Necesitarás algo de BNB para el gas de salida.
        </p>
      </div>
    </div>
  );
};
