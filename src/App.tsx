/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Plus,
  Layers,
  SlidersHorizontal,
  Gavel,
  Wallet,
  Download,
  Upload,
  RotateCcw,
} from 'lucide-react';

import {
  PredictionMarket,
  OutcomeType,
  SupportedNetwork,
  WalletState,
} from './types';

import { DEFAULT_NETWORK } from './data/mockMarkets';

import { useMarketStore } from './hooks/useMarketStore';
import { useWallet } from './services/web3Service';
import { exportStateJson } from './store/persistence';

import { ClientOnly } from './components/ClientOnly';
import { RealMarketsView } from './components/RealMarketsView';
import { Navbar } from './components/Navbar';
import { StatsTicker } from './components/StatsTicker';
import { CategoryFilter } from './components/CategoryFilter';
import { MarketCard } from './components/MarketCard';
import { MyPositionsDrawer } from './components/MyPositionsDrawer';
import { TradeModal } from './components/TradeModal';
import { WalletConnectModal } from './components/WalletConnectModal';
import { CreateMarketModal } from './components/CreateMarketModal';
import { FaucetModal } from './components/FaucetModal';
import { MarketDetailModal } from './components/MarketDetailModal';
import { ResolveMarketModal } from './components/ResolveMarketModal';
import { PrivateAccessModal } from './components/PrivateAccessModal';

import { formatCurrency } from './utils/formatters';

type SortKey = 'volume' | 'probability' | 'expiry' | 'newest';

/**
 * Modo de la app.
 *
 * `practice`: mercados tuyos, saldo ficticio, todo en este navegador.
 * `real`: mercados reales de Polymarket en Polygon, USDC de verdad.
 *
 * El modo arranca siempre en `practice`: entrar en dinero real debe ser una
 * decisión explícita, no el estado por defecto al abrir la página.
 */
type AppMode = 'practice' | 'real';

const MODE_STORAGE_KEY = 'aether-markets/mode';

export default function App() {
  const store = useMarketStore();
  const walletConn = useWallet();

  const [mode, setMode] = useState<AppMode>(() => {
    try {
      return window.localStorage.getItem(MODE_STORAGE_KEY) === 'real'
        ? 'real'
        : 'practice';
    } catch {
      return 'practice';
    }
  });

  const changeMode = (next: AppMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // Si localStorage falla, el modo simplemente no se recuerda.
    }
  };

  // Filtros
  const [selectedCategory, setSelectedCategory] = useState<
    PredictionMarket['category']
  >('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('volume');

  // Modales
  const [isPositionsOpen, setIsPositionsOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isCreateMarketOpen, setIsCreateMarketOpen] = useState(false);
  const [isFaucetOpen, setIsFaucetOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [isPrivateGateOpen, setIsPrivateGateOpen] = useState(false);

  const [tradeModalMarket, setTradeModalMarket] =
    useState<PredictionMarket | null>(null);
  const [tradeInitialOutcome, setTradeInitialOutcome] =
    useState<OutcomeType>('YES');
  const [detailModalMarket, setDetailModalMarket] =
    useState<PredictionMarket | null>(null);
  const [resolveMarket, setResolveMarket] = useState<PredictionMarket | null>(
    null,
  );
  const [gateMarket, setGateMarket] = useState<PredictionMarket | null>(null);

  /**
   * `WalletState` para los componentes existentes.
   *
   * `usdcBalance` es el SALDO DE PRÁCTICA del store, no tu USDC en cadena. Es
   * lo que se debita al operar. Tu saldo real on-chain se muestra aparte, solo
   * lectura, en el modal de wallet.
   */
  const wallet: WalletState = useMemo(
    () => ({
      isConnected: walletConn.isConnected,
      address: walletConn.address,
      ensName: null,
      network: DEFAULT_NETWORK,
      usdcBalance: store.bankrollUsd,
      ethBalance: 0,
      walletProvider: walletConn.isConnected ? 'Wallet conectada' : null,
    }),
    [walletConn.isConnected, walletConn.address, store.bankrollUsd],
  );

  const visibleMarkets = useMemo(() => {
    return store.markets
      .filter((market) => {
        if (selectedCategory !== 'All' && market.category !== selectedCategory) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            market.title.toLowerCase().includes(q) ||
            market.description.toLowerCase().includes(q) ||
            market.category.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        // Los mercados resueltos van al final.
        if (a.status !== b.status) {
          if (a.status === 'resolved') return 1;
          if (b.status === 'resolved') return -1;
        }
        if (sortBy === 'volume') return b.volume24hUsd - a.volume24hUsd;
        if (sortBy === 'probability') return b.yesProbability - a.yesProbability;
        if (sortBy === 'expiry') {
          return (
            new Date(a.resolutionDate).getTime() -
            new Date(b.resolutionDate).getTime()
          );
        }
        if (sortBy === 'newest') return b.id.localeCompare(a.id);
        return 0;
      });
  }, [store.markets, selectedCategory, searchQuery, sortBy]);

  /** Intercepta mercados privados bloqueados antes de abrir cualquier vista. */
  const guard = (market: PredictionMarket, action: () => void) => {
    if (!store.isMarketUnlocked(market)) {
      setGateMarket(market);
      setIsPrivateGateOpen(true);
      return;
    }
    action();
  };

  const handleOpenTrade = (market: PredictionMarket, outcome: OutcomeType) => {
    guard(market, () => {
      setTradeModalMarket(market);
      setTradeInitialOutcome(outcome);
      setIsTradeModalOpen(true);
    });
  };

  const handleOpenDetails = (market: PredictionMarket) => {
    guard(market, () => {
      setDetailModalMarket(market);
      setIsDetailModalOpen(true);
    });
  };

  const handleOpenResolve = (market: PredictionMarket) => {
    guard(market, () => {
      setResolveMarket(market);
      setIsResolveOpen(true);
    });
  };

  /** Ejecuta la compra contra el store. Devuelve error para que el modal lo muestre. */
  const handleExecuteTrade = (input: {
    marketId: string;
    outcome: OutcomeType;
    amountUsd: number;
  }) => {
    const result = store.buyShares(input);

    if (result.ok) {
      try {
        confetti({
          particleCount: 45,
          spread: 60,
          origin: { y: 0.8 },
          colors:
            input.outcome === 'YES'
              ? ['#10b981', '#34d399', '#6ee7b7']
              : ['#f43f5e', '#fb7185', '#fda4af'],
        });
      } catch {
        // confetti es decorativo; si falla no importa
      }
    }

    return result;
  };

  const handleMarketCreated = (newMarket: PredictionMarket) => {
    store.createMarket(newMarket);
    setSelectedCategory(newMarket.category);
    try {
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.7 } });
    } catch {
      // ignorar
    }
  };

  const handleSwitchNetwork = (network: SupportedNetwork) => {
    if (network.id === 137) walletConn.switchToPolygon();
  };

  /** Descarga un respaldo JSON de todo tu mercado. */
  const handleExportBackup = () => {
    const json = exportStateJson(store.rawState);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.importState(String(reader.result));
      } catch (error) {
        window.alert(
          error instanceof Error ? error.message : 'No se pudo importar.',
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleReset = () => {
    const ok = window.confirm(
      'Esto borra tus mercados, posiciones y saldo, y restaura los de ejemplo. ¿Continuar?',
    );
    if (ok) store.resetAll();
  };

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
          wallet={wallet}
          positionsCount={store.positions.length}
          totalPnlUsd={store.totals.totalPnlUsd}
          onConnectWalletClick={() => setIsWalletModalOpen(true)}
          onOpenPositionsClick={() => setIsPositionsOpen(true)}
          onCreateMarketClick={() => setIsCreateMarketOpen(true)}
          onOpenFaucetClick={() => setIsFaucetOpen(true)}
          onSwitchNetwork={handleSwitchNetwork}
          mode={mode}
          onchainUsdcBalance={walletConn.usdcBalance}
        />
      </ClientOnly>

      <ClientOnly>
        <StatsTicker
          totalVolume24h={store.totals.volume24hUsd}
          totalLiquidity={store.totals.liquidityUsd}
          activeMarketsCount={store.totals.activeMarketsCount}
        />
      </ClientOnly>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        {/* Selector de modo: práctica vs dinero real */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#0f121a] border border-neutral-800 self-start">
          <button
            onClick={() => changeMode('practice')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              mode === 'practice'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Práctica
          </button>
          <button
            onClick={() => changeMode('real')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              mode === 'real'
                ? 'bg-rose-500 text-black shadow-lg shadow-rose-500/20'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Real · Polygon
          </button>
        </div>

        {mode === 'real' ? (
          <RealMarketsView onConnectWallet={() => setIsWalletModalOpen(true)} />
        ) : (
          <>
        {/* Panel de cartera */}
        <div className="relative rounded-2xl bg-gradient-to-r from-[#121622] via-[#0f131c] to-[#121622] border border-neutral-800/80 p-5 sm:p-6 overflow-hidden shadow-xl">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Mercado personal
                </span>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  Saldo de práctica
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-display font-extrabold text-neutral-100 tracking-tight">
                Tu terminal de predicciones
              </h1>
              <p className="text-xs sm:text-sm text-neutral-400 mt-1 leading-relaxed">
                Crea tus propios mercados, apuesta con saldo de práctica y
                resuélvelos tú mismo. Todo se guarda en este navegador — sin
                dinero real y sin depender de ningún protocolo externo.
              </p>
            </div>

            {/* Cifras de cartera */}
            <div className="flex items-stretch gap-3 shrink-0 w-full lg:w-auto">
              <div className="flex-1 lg:flex-none rounded-xl bg-[#0a0c11]/80 border border-neutral-800 px-4 py-3">
                <div className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
                  Disponible
                </div>
                <div className="text-lg font-mono font-bold text-neutral-100 mt-0.5">
                  {formatCurrency(store.bankrollUsd)}
                </div>
              </div>

              <div className="flex-1 lg:flex-none rounded-xl bg-[#0a0c11]/80 border border-neutral-800 px-4 py-3">
                <div className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
                  Patrimonio
                </div>
                <div className="text-lg font-mono font-bold text-neutral-100 mt-0.5">
                  {formatCurrency(store.totals.netWorthUsd)}
                </div>
              </div>

              <div className="flex-1 lg:flex-none rounded-xl bg-[#0a0c11]/80 border border-neutral-800 px-4 py-3">
                <div className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
                  P&amp;L abierto
                </div>
                <div
                  className={`text-lg font-mono font-bold mt-0.5 ${
                    store.totals.totalPnlUsd >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {store.totals.totalPnlUsd >= 0 ? '+' : ''}
                  {formatCurrency(store.totals.totalPnlUsd)}
                </div>
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="relative z-10 flex items-center gap-2.5 mt-5 flex-wrap">
            <button
              onClick={() => setIsCreateMarketOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all shadow-lg shadow-emerald-500/15 active:scale-95"
            >
              <Plus className="w-4 h-4 text-black" />
              <span>Crear mercado</span>
            </button>

            <button
              onClick={() => setIsPositionsOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700 text-xs font-bold text-neutral-200 hover:text-white transition-all active:scale-95"
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Mis posiciones ({store.positions.length})</span>
            </button>

            <button
              onClick={() => setIsFaucetOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700 text-xs font-bold text-neutral-200 hover:text-white transition-all active:scale-95"
            >
              <Wallet className="w-4 h-4 text-amber-400" />
              <span>Recargar práctica</span>
            </button>

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={handleExportBackup}
                title="Descargar respaldo JSON"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900/70 hover:bg-neutral-800 border border-neutral-800 text-[11px] font-semibold text-neutral-400 hover:text-neutral-200 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Respaldar</span>
              </button>

              <label
                title="Importar respaldo JSON"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900/70 hover:bg-neutral-800 border border-neutral-800 text-[11px] font-semibold text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Importar</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>

              <button
                onClick={handleReset}
                title="Restaurar estado inicial"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900/70 hover:bg-neutral-800 border border-neutral-800 text-[11px] font-semibold text-neutral-400 hover:text-rose-400 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reiniciar</span>
              </button>
            </div>
          </div>
        </div>

        <CategoryFilter
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          categoryCounts={store.categoryCounts}
        />

        <section
          aria-label="Mercados de predicción"
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono font-bold uppercase text-neutral-400 tracking-wider flex items-center gap-2">
              <span>Mercados</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-mono">
                {visibleMarkets.length}
              </span>
            </h2>
            <span className="text-xs font-mono text-neutral-500 hidden sm:block">
              1 share ganadora = $1.00
            </span>
          </div>

          {visibleMarkets.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center rounded-2xl bg-[#0f121a] border border-dashed border-neutral-800 p-8">
              <SlidersHorizontal className="w-10 h-10 text-neutral-600 mb-3" />
              <h3 className="text-base font-bold text-neutral-200">
                {store.markets.length === 0
                  ? 'Aún no tienes mercados'
                  : 'No se encontraron mercados'}
              </h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                {store.markets.length === 0
                  ? 'Crea tu primer mercado para empezar a registrar predicciones.'
                  : 'Ninguno coincide con los filtros o la búsqueda actual.'}
              </p>
              {store.markets.length === 0 ? (
                <button
                  onClick={() => setIsCreateMarketOpen(true)}
                  className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear mi primer mercado</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSelectedCategory('All');
                    setSearchQuery('');
                  }}
                  className="mt-4 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleMarkets.map((market) => {
                const locked = !store.isMarketUnlocked(market);

                return (
                  <div key={market.id} className="relative flex flex-col gap-2">
                    <MarketCard
                      market={market}
                      locked={locked}
                      onTradeClick={handleOpenTrade}
                      onDetailsClick={handleOpenDetails}
                    />

                    {/* Resolver: disponible para cualquier mercado activo, porque
                        aquí el árbitro eres tú. */}
                    {!locked && market.status === 'active' && (
                      <button
                        onClick={() => handleOpenResolve(market)}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-neutral-900/70 hover:bg-neutral-800 border border-neutral-800 hover:border-amber-500/30 text-[11px] font-semibold text-neutral-400 hover:text-amber-400 transition-all active:scale-98"
                      >
                        <Gavel className="w-3.5 h-3.5" />
                        <span>Resolver este mercado</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
          </>
        )}
      </main>

      <div className="fixed bottom-4 right-4 z-30 sm:hidden">
        <button
          onClick={() => setIsPositionsOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-500 text-black font-bold text-xs shadow-2xl shadow-emerald-500/40 active:scale-95"
        >
          <Layers className="w-4 h-4 text-black" />
          <span>Posiciones ({store.positions.length})</span>
        </button>
      </div>

      <footer className="mt-12 border-t border-neutral-800/70 bg-[#07090d] py-6 px-4 sm:px-6 lg:px-8 text-xs text-neutral-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="font-bold text-neutral-400">AETHER MARKETS</span>
            <span>•</span>
            <span>Mercado de predicciones personal</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] flex-wrap justify-center">
            <span>Datos guardados en este navegador</span>
            <span>•</span>
            <span className="text-amber-500/90">Saldo de práctica</span>
          </div>
        </div>
      </footer>

      {/* Modales */}
      <MyPositionsDrawer
        isOpen={isPositionsOpen}
        onClose={() => setIsPositionsOpen(false)}
        wallet={wallet}
        positions={store.positions}
        transactions={store.transactions}
        onSellPosition={store.sellPosition}
        onOpenFaucet={() => setIsFaucetOpen(true)}
      />

      <ClientOnly>
        <TradeModal
          isOpen={isTradeModalOpen}
          onClose={() => setIsTradeModalOpen(false)}
          market={
            tradeModalMarket
              ? store.markets.find((m) => m.id === tradeModalMarket.id) ?? null
              : null
          }
          initialOutcome={tradeInitialOutcome}
          wallet={wallet}
          onConnectWallet={() => {
            setIsTradeModalOpen(false);
            setIsWalletModalOpen(true);
          }}
          onExecuteTrade={handleExecuteTrade}
        />
      </ClientOnly>

      <ClientOnly>
        <WalletConnectModal
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
          onOpenFaucet={() => setIsFaucetOpen(true)}
        />
      </ClientOnly>

      <ClientOnly>
        <CreateMarketModal
          isOpen={isCreateMarketOpen}
          onClose={() => setIsCreateMarketOpen(false)}
          wallet={wallet}
          onMarketCreated={handleMarketCreated}
        />
      </ClientOnly>

      <ClientOnly>
        <FaucetModal
          isOpen={isFaucetOpen}
          onClose={() => setIsFaucetOpen(false)}
          wallet={wallet}
          onAddFunds={store.addPracticeFunds}
        />
      </ClientOnly>

      <MarketDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        market={
          detailModalMarket
            ? store.markets.find((m) => m.id === detailModalMarket.id) ?? null
            : null
        }
        onTradeClick={handleOpenTrade}
      />

      <ResolveMarketModal
        isOpen={isResolveOpen}
        onClose={() => setIsResolveOpen(false)}
        market={resolveMarket}
        positions={store.positions}
        onResolve={store.resolveMarket}
        onDelete={store.deleteMarket}
      />

      <PrivateAccessModal
        isOpen={isPrivateGateOpen}
        onClose={() => setIsPrivateGateOpen(false)}
        market={gateMarket}
        onSubmitCode={store.unlockMarket}
      />
    </div>
  );
}
