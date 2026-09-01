/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

import { BridgeModal, gasDestinationKey } from './components/BridgeModal';
import { ClientOnly } from './components/ClientOnly';
import { MarketsView } from './components/MarketsView';
import { Navbar } from './components/Navbar';
import { PositionsDrawer } from './components/PositionsDrawer';
import { WalletConnectModal } from './components/WalletConnectModal';

/**
 * La app entera es el terminal de mercados reales, alimentado por el registry
 * de venues a través del dominio. El modo práctica y su contabilidad local se
 * eliminaron en la Fase 4: aquí todo es dinero real y cada operación se firma.
 */
export default function App() {
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isPositionsOpen, setIsPositionsOpen] = useState(false);
  const [isBridgeOpen, setIsBridgeOpen] = useState(false);
  /** Destino a preseleccionar en el bridge (p. ej. gas nativo de una red). */
  const [bridgeDestination, setBridgeDestination] = useState<string | undefined>(
    undefined,
  );

  return (
    <div className="min-h-screen bg-[#090b0f] text-neutral-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-300">
      <ClientOnly
        fallback={
          <div className="h-16 border-b border-neutral-800/60 bg-[#0d0f14]/90 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          </div>
        }
      >
        <Navbar
          onConnectWalletClick={() => setIsWalletModalOpen(true)}
          onOpenPositionsClick={() => setIsPositionsOpen(true)}
        />
      </ClientOnly>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        <ClientOnly>
          <MarketsView
            onConnectWallet={() => setIsWalletModalOpen(true)}
            onGetGas={(chainId) => {
              setBridgeDestination(gasDestinationKey(chainId));
              setIsBridgeOpen(true);
            }}
          />
        </ClientOnly>
      </main>

      <footer className="mt-12 border-t border-neutral-800/70 bg-[#07090d] py-6 px-4 sm:px-6 lg:px-8 text-xs text-neutral-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="font-bold text-neutral-400">AETHER MARKETS</span>
            <span>•</span>
            <span>Mercados de predicción reales</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] flex-wrap justify-center">
            <span>Polygon · Base</span>
            <span>•</span>
            <span className="text-rose-400/90">Dinero real: cada orden la firmas tú</span>
          </div>
        </div>
      </footer>

      <ClientOnly>
        <WalletConnectModal
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
          onOpenBridge={(destination) => {
            setIsWalletModalOpen(false);
            setBridgeDestination(destination);
            setIsBridgeOpen(true);
          }}
        />
      </ClientOnly>

      <ClientOnly>
        <BridgeModal
          isOpen={isBridgeOpen}
          onClose={() => setIsBridgeOpen(false)}
          initialDestination={bridgeDestination}
        />
      </ClientOnly>

      <ClientOnly>
        <PositionsDrawer
          isOpen={isPositionsOpen}
          onClose={() => setIsPositionsOpen(false)}
        />
      </ClientOnly>
    </div>
  );
}
