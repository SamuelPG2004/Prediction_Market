import React, { useState } from 'react';
import { X, Plus, Sparkles, Lock, Loader2, Info } from 'lucide-react';
import { MarketCategory, PredictionMarket, WalletState } from '../types';

interface CreateMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: WalletState;
  onMarketCreated: (newMarket: PredictionMarket) => void;
}

export const CreateMarketModal: React.FC<CreateMarketModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onMarketCreated,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MarketCategory>('Crypto');
  const [resolutionDate, setResolutionDate] = useState('2026-10-31');
  const [resolutionSource, setResolutionSource] = useState('Resolución manual');
  const [initialLiquidity, setInitialLiquidity] = useState('500');
  const [isPrivate, setIsPrivate] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [rulesInput, setRulesInput] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);

  if (!isOpen) return null;

  const handleDeployMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsDeploying(true);

    const newMarket: PredictionMarket = {
      id: `m-custom-${Date.now()}`,
      title: isPrivate ? `[PRIVADO] ${title}` : title,
      description: description || 'Mercado creado por mí.',
      category: isPrivate ? 'Private' : category,
      resolutionDate: new Date(resolutionDate).toISOString(),
      resolutionSource: resolutionSource || 'Resolución manual',
      // Abre en 50/50: sin información previa, ninguna probabilidad está
      // justificada. El precio se moverá con las órdenes.
      yesProbability: 50,
      noProbability: 50,
      yesPriceUsd: 0.5,
      noPriceUsd: 0.5,
      volume24hUsd: 0,
      // La liquidez inicial calibra cuánto mueve el precio cada orden.
      totalLiquidityUsd: parseFloat(initialLiquidity) || 500,
      iconName: isPrivate ? 'shield' : 'sparkles',
      badge: isPrivate ? '🔒 Privado' : undefined,
      isPrivate,
      privateAccessCode: isPrivate ? accessCode || undefined : undefined,
      creatorAddress: wallet.address || undefined,
      status: 'active',
      rules: rulesInput.split('\n').filter(Boolean),
      sparkline: [50],
      recentTrades: [],
    };

    onMarketCreated(newMarket);
    setIsDeploying(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0f121a] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-[#131722]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-100">
                Crear mercado
              </h3>
              <p className="text-xs text-neutral-400">
                Tu pregunta, tus reglas, tú lo resuelves
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

        {/* Form Form */}
        <form onSubmit={handleDeployMarket} className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          
          {/* Question / Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-neutral-300">
              Pregunta o Evento del Mercado *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: ¿Solana alcanzará $300 USD antes de fin de año?"
              className="w-full bg-[#0a0c12] text-neutral-100 text-xs rounded-xl px-3.5 py-2.5 border border-neutral-800 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-neutral-300">
              Descripción y Criterios de Resolución
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalla las condiciones exactas para que el mercado resuelva en SÍ o NO..."
              className="w-full bg-[#0a0c12] text-neutral-100 text-xs rounded-xl px-3.5 py-2 border border-neutral-800 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
            />
          </div>

          {/* Category & Resolution Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-300">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MarketCategory)}
                className="w-full bg-[#0a0c12] text-neutral-200 text-xs rounded-xl px-3 py-2.5 border border-neutral-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="Crypto">Criptomonedas</option>
                <option value="Macro">Macroeconomía</option>
                <option value="AI & Tech">IA & Tecnología</option>
                <option value="Geopolitics">Geopolítica</option>
                <option value="Sports">⚽ Deportes</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-300">
                Fecha Límite
              </label>
              <input
                type="date"
                value={resolutionDate}
                onChange={(e) => setResolutionDate(e.target.value)}
                className="w-full bg-[#0a0c12] text-neutral-200 text-xs rounded-xl px-3 py-2.5 border border-neutral-800 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Fuente que usarás para decidir el resultado */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-neutral-300">
              ¿Con qué decidirás el resultado?
            </label>
            <input
              type="text"
              value={resolutionSource}
              onChange={(e) => setResolutionSource(e.target.value)}
              placeholder="Ej: precio de CoinGecko, acta oficial, mi propio criterio"
              className="w-full bg-[#0a0c12] text-neutral-200 text-xs rounded-xl px-3 py-2.5 border border-neutral-800 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-neutral-500">
              Nota para tu yo futuro: te lo recordará al resolver.
            </span>
          </div>

          {/* Reglas: una por línea */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-neutral-300 flex justify-between">
              <span>Reglas</span>
              <span className="text-[11px] font-normal text-neutral-500">
                una por línea
              </span>
            </label>
            <textarea
              rows={3}
              value={rulesInput}
              onChange={(e) => setRulesInput(e.target.value)}
              placeholder={
                'Se resuelve SÍ si...\nSe resuelve NO si...\nEn caso de empate, se anula.'
              }
              className="w-full bg-[#0a0c12] text-neutral-100 text-xs rounded-xl px-3.5 py-2 border border-neutral-800 focus:outline-none focus:border-emerald-500 transition-colors resize-none font-mono leading-relaxed"
            />
          </div>

          {/* Profundidad inicial: calibra el impacto de cada orden */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-neutral-300 flex justify-between">
              <span>Profundidad inicial</span>
              <span className="text-[11px] font-mono text-neutral-500">
                cuanto más alta, menos mueve el precio cada orden
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 font-mono text-xs">$</span>
              <input
                type="number"
                min="50"
                value={initialLiquidity}
                onChange={(e) => setInitialLiquidity(e.target.value)}
                className="w-full bg-[#0a0c12] text-neutral-100 font-mono text-xs rounded-xl pl-8 pr-16 py-2.5 border border-neutral-800 focus:outline-none focus:border-emerald-500"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-neutral-400">
                USDC
              </span>
            </div>
          </div>

          {/* Private Syndicate Toggle */}
          <div className="p-3.5 rounded-xl bg-[#090b10] border border-neutral-800/80 flex flex-col gap-2">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="text-xs font-bold text-neutral-200 block">
                    Mercado Privado / Sindicato
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    Solo usuarios con código o whitelist podrán operar
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
            </label>

            {isPrivate && (
              <div className="pt-2 mt-1 border-t border-neutral-800 flex flex-col gap-1.5">
                <input
                  type="text"
                  required
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Código de acceso (Ej: ALPHA-SYNDICATE)"
                  className="w-full bg-[#12151d] text-neutral-100 text-xs rounded-lg px-3 py-2 border border-neutral-700 focus:outline-none focus:border-amber-400 font-mono"
                />
                <span className="text-[10px] text-neutral-500">
                  Obligatorio: sin código el mercado quedaría inaccesible.
                </span>
              </div>
            )}
          </div>

          {/* Info Note */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-neutral-900/70 border border-neutral-800 text-neutral-400 text-xs">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-neutral-500" />
            <div>
              <p className="font-semibold mb-1 text-neutral-300">
                Tú eres el árbitro
              </p>
              <p className="leading-relaxed">
                El mercado abre al 50/50 y el precio se mueve con tus órdenes.
                Cuando el evento ocurra, decides el resultado desde
                &laquo;Resolver este mercado&raquo; y cada share ganadora paga
                $1. Se guarda en este navegador.
              </p>
            </div>
          </div>

          {/* Deploy Submit Button */}
          <button
            type="submit"
            id="btn-submit-create-market"
            disabled={isDeploying || !title.trim()}
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold text-xs shadow-lg shadow-emerald-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isDeploying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>Creando...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-black" />
                <span>Crear mercado</span>
              </>
            )}
          </button>

        </form>
      </div>
    </div>
  );
};
