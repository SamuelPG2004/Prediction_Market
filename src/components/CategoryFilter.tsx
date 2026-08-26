import React from 'react';
import { 
  Search, 
  Sparkles, 
  Coins, 
  Landmark, 
  Cpu, 
  Globe, 
  Lock, 
  Trophy,
  ArrowDownUp
} from 'lucide-react';
import { MarketCategory } from '../types';

interface CategoryFilterProps {
  selectedCategory: MarketCategory;
  onSelectCategory: (category: MarketCategory) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: 'volume' | 'probability' | 'expiry' | 'newest';
  onSortChange: (sort: 'volume' | 'probability' | 'expiry' | 'newest') => void;
  categoryCounts: Record<MarketCategory, number>;
}

const CATEGORIES: { id: MarketCategory; label: string; icon: React.ElementType }[] = [
  { id: 'All', label: 'Todos', icon: Sparkles },
  { id: 'Crypto', label: 'Cripto', icon: Coins },
  { id: 'Macro', label: 'Macroeconomía', icon: Landmark },
  { id: 'AI & Tech', label: 'IA & Tech', icon: Cpu },
  { id: 'Geopolitics', label: 'Geopolítica', icon: Globe },
  { id: 'Sports', label: '⚽ Deportes', icon: Trophy },
  { id: 'Private', label: 'Privados', icon: Lock },
];

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  categoryCounts,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Category Pills and Search/Sort Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Category Pills Carousel */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;

            return (
              <button
                key={cat.id}
                id={`filter-cat-${cat.id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                onClick={() => onSelectCategory(cat.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 border active:scale-95 ${
                  isSelected
                    ? 'bg-neutral-100 text-neutral-950 border-white shadow-md shadow-white/5 font-bold'
                    : 'bg-[#12151d]/90 text-neutral-400 border-neutral-800/80 hover:bg-[#181d28] hover:text-neutral-200 hover:border-neutral-700'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-neutral-950' : 'text-neutral-400'}`} />
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? 'bg-neutral-900/15 text-neutral-900 font-bold'
                      : 'bg-neutral-800/90 text-neutral-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-market-search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar mercado o evento..."
              className="w-full bg-[#12151d] text-neutral-100 placeholder-neutral-500 text-xs rounded-xl pl-9 pr-8 py-2 border border-neutral-800 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50 transition-all font-sans"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="relative">
            <select
              id="select-market-sort"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as any)}
              aria-label="Ordenar mercados por"
              className="bg-[#12151d] text-neutral-300 text-xs rounded-xl px-3 py-2 border border-neutral-800 focus:outline-none focus:border-emerald-500 cursor-pointer font-medium hover:bg-[#161a24] transition-colors pr-8 appearance-none"
            >
              <option value="volume">Mayor Volumen</option>
              <option value="probability">Mayor Probabilidad</option>
              <option value="expiry">Próxima Resolución</option>
              <option value="newest">Más Recientes</option>
            </select>
            <ArrowDownUp className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

      </div>
    </div>
  );
};
