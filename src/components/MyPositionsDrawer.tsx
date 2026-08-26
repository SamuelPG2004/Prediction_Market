import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  History, 
  Sparkles,
} from 'lucide-react';
import { UserPosition, WalletState, Web3Transaction } from '../types';
import { formatCurrency, formatPercent, shortenAddress } from '../utils/formatters';

interface MyPositionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: WalletState;
  positions: UserPosition[];
  transactions: Web3Transaction[];
  onSellPosition: (positionId: string, sharesToSell?: number) => void;
  onOpenFaucet: () => void;
}

export const MyPositionsDrawer: React.FC<MyPositionsDrawerProps> = ({
  isOpen,
  onClose,
  wallet,
  positions,
  transactions,
  onSellPosition,
  onOpenFaucet,
}) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');
  const [sellingPosId, setSellingPosId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate portfolio totals
  const totalPositionsValue = positions.reduce((acc, pos) => acc + pos.currentValueUsd, 0);
  const totalCost = positions.reduce((acc, pos) => acc + pos.totalCostUsd, 0);
  const totalPnlUsd = totalPositionsValue - totalCost;
  const totalPnlPercentage = totalCost > 0 ? (totalPnlUsd / totalCost) * 100 : 0;
  const totalNetWorth = wallet.usdcBalance + totalPositionsValue;

  const handleExecuteSell = (pos: UserPosition) => {
    // TODO: Connect to Web3 / Smart Contract via Viem or Wagmi here
    // Example:
    // const { writeContractAsync } = useWriteContract();
    // await writeContractAsync({
    //   address: PREDICTION_MARKET_CONTRACT_ADDRESS,
    //   abi: AETHER_PREDICTION_ROUTER_ABI,
    //   functionName: 'sellShares',
    //   args: [pos.marketId, pos.outcome === 'YES' ? 0 : 1, parseUnits(pos.sharesCount.toString(), 6)],
    // });
    onSellPosition(pos.id);
    setSellingPosId(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Floating Side Drawer */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#0e1017] border-l border-neutral-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
          
          {/* Drawer Header */}
          <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-[#12151f]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
                  Mis Posiciones
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
                    {positions.length}
                  </span>
                </h2>
                <p className="text-xs text-neutral-400 font-mono">
                  {wallet.address ? shortenAddress(wallet.address, 6) : 'Billetera no conectada'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Portfolio Summary Card */}
          <div className="p-5 border-b border-neutral-800/80 bg-gradient-to-b from-[#141824] to-[#0e1017]">
            <div className="text-xs font-mono uppercase text-neutral-400 tracking-wider mb-1">
              Patrimonio Total (USDC + Posiciones)
            </div>
            <div className="text-2xl font-mono font-extrabold text-neutral-100 mb-4">
              {formatCurrency(totalNetWorth)}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-neutral-800/80">
              {/* USDC Cash Balance */}
              <div className="rounded-xl bg-[#0a0c10] p-2.5 border border-neutral-800">
                <span className="text-[10px] font-mono uppercase text-neutral-400">Balance USDC</span>
                <div className="text-sm font-mono font-bold text-neutral-100 mt-0.5">
                  {formatCurrency(wallet.usdcBalance)}
                </div>
              </div>

              {/* Total Unrealized PnL */}
              <div className="rounded-xl bg-[#0a0c10] p-2.5 border border-neutral-800">
                <span className="text-[10px] font-mono uppercase text-neutral-400">PnL No Realizado</span>
                <div className={`text-sm font-mono font-bold mt-0.5 flex items-center gap-1 ${totalPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPnlUsd >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {totalPnlUsd >= 0 ? `+${formatCurrency(totalPnlUsd)}` : formatCurrency(totalPnlUsd)}
                  <span className="text-[11px]">({formatPercent(totalPnlPercentage, true)})</span>
                </div>
              </div>
            </div>

            {/* Quick Faucet Refill Bar */}
            <div className="mt-3 flex items-center justify-between p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs">
              <span className="text-neutral-400">¿Necesitas saldo de prueba?</span>
              <button
                onClick={onOpenFaucet}
                className="text-emerald-400 hover:text-emerald-300 font-semibold font-mono underline decoration-emerald-500/40 cursor-pointer"
              >
                + Faucet USDC
              </button>
            </div>
          </div>

          {/* Navigation Tabs (Posiciones vs Historial) */}
          <div className="flex border-b border-neutral-800 bg-[#0c0e14] px-5 pt-2">
            <button
              onClick={() => setActiveTab('positions')}
              className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'positions'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Apuestas Activas ({positions.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Historial On-Chain ({transactions.length})</span>
            </button>
          </div>

          {/* Tab Content List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
            {activeTab === 'positions' ? (
              positions.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-neutral-800">
                  <Layers className="w-10 h-10 text-neutral-600 mb-3" />
                  <h4 className="text-sm font-bold text-neutral-300">Sin posiciones activas</h4>
                  <p className="text-xs text-neutral-500 mt-1 max-w-xs">
                    Explora los mercados de predicción en el panel central y compra contratos de SÍ o NO para comenzar.
                  </p>
                </div>
              ) : (
                positions.map((pos) => {
                  const isPositive = pos.pnlUsd >= 0;

                  return (
                    <div
                      key={pos.id}
                      className="rounded-xl bg-[#12151f] border border-neutral-800/80 hover:border-neutral-700 transition-all p-4 flex flex-col gap-3"
                    >
                      {/* Top: Outcome & Category */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md border ${
                              pos.outcome === 'YES'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {pos.outcome === 'YES' ? 'SÍ (YES)' : 'NO (NO)'}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-500 uppercase">
                            {pos.category}
                          </span>
                        </div>

                        {/* PnL Pill */}
                        <div className={`text-xs font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositive ? `+${formatCurrency(pos.pnlUsd)}` : formatCurrency(pos.pnlUsd)}
                          <span className="text-[10px] ml-1">({formatPercent(pos.pnlPercentage, true)})</span>
                        </div>
                      </div>

                      {/* Title */}
                      <h4 className="text-xs font-bold text-neutral-200 line-clamp-2">
                        {pos.marketTitle}
                      </h4>

                      {/* Position Details Matrix */}
                      <div className="grid grid-cols-3 gap-2 py-2 border-y border-neutral-800/60 text-[11px] font-mono">
                        <div>
                          <span className="text-neutral-500 block text-[10px]">Shares</span>
                          <span className="text-neutral-200 font-semibold">{pos.sharesCount.toFixed(1)}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block text-[10px]">Precio Compra</span>
                          <span className="text-neutral-200 font-semibold">${pos.avgPricePaidUsd.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500 block text-[10px]">Valor Actual</span>
                          <span className="text-neutral-100 font-bold">{formatCurrency(pos.currentValueUsd)}</span>
                        </div>
                      </div>

                      {/* Sell / Cashout Action */}
                      {sellingPosId === pos.id ? (
                        <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-700 flex flex-col gap-2">
                          <p className="text-[11px] text-neutral-300">
                            ¿Confirmar venta de <span className="font-mono font-bold text-neutral-100">{pos.sharesCount.toFixed(1)} shares</span> por <span className="font-mono font-bold text-emerald-400">{formatCurrency(pos.currentValueUsd)}</span>?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleExecuteSell(pos)}
                              className="flex-1 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-colors"
                            >
                              Confirmar Venta
                            </button>
                            <button
                              onClick={() => setSellingPosId(null)}
                              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-neutral-500 font-mono">
                            Pagado: {formatCurrency(pos.totalCostUsd)}
                          </span>
                          <button
                            id={`btn-sell-pos-${pos.id}`}
                            onClick={() => setSellingPosId(pos.id)}
                            className="px-3 py-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700/60 text-xs font-semibold text-neutral-200 hover:text-white transition-all active:scale-95"
                          >
                            Vender / Liquidar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )
            ) : (
              /* Transaction History Tab */
              transactions.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-neutral-500">
                  <History className="w-10 h-10 mb-2 text-neutral-600" />
                  <p className="text-xs">No hay transacciones registradas.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 rounded-xl bg-[#12151f] border border-neutral-800/80 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg ${
                          tx.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' :
                          tx.type === 'SELL' ? 'bg-rose-500/10 text-rose-400' :
                          'bg-indigo-500/10 text-indigo-400'
                        }`}>
                          {tx.type === 'BUY' ? <ArrowDownRight className="w-3.5 h-3.5" /> : 
                           tx.type === 'SELL' ? <ArrowUpRight className="w-3.5 h-3.5" /> :
                           <Sparkles className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className="font-bold text-neutral-200">
                            {tx.type === 'BUY' ? `Compró ${tx.outcome}` :
                             tx.type === 'SELL' ? `Vendió ${tx.outcome}` :
                             'Faucet Claim'}
                          </div>
                          <div className="text-[10px] text-neutral-500 truncate max-w-[170px]">
                            {tx.marketTitle || 'Aether Sandbox'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-neutral-100">
                          {tx.type === 'BUY' ? `-${formatCurrency(tx.amountUsd)}` : `+${formatCurrency(tx.amountUsd)}`}
                        </div>
                        <div className="text-[10px] text-neutral-500 flex items-center gap-1 justify-end">
                          <span>{tx.timestamp}</span>
                          <span className="text-emerald-400 font-bold">✓</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-neutral-800 bg-[#10131c] flex items-center justify-between text-xs font-mono text-neutral-400">
            <span>Red: {wallet.network.name}</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sincronizado L2
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};
