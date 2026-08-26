import React, { useEffect, useState } from 'react';
import { X, Lock, KeyRound, AlertCircle } from 'lucide-react';
import { PredictionMarket } from '../types';

interface PrivateAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: PredictionMarket | null;
  onSubmitCode: (marketId: string, code: string) => boolean;
}

/**
 * Puerta de acceso a un mercado privado.
 *
 * Antes `privateAccessCode` solo pintaba un candado decorativo: nada lo
 * verificaba. Ahora el contenido del mercado queda oculto hasta introducir el
 * código correcto, y el desbloqueo se recuerda en este navegador.
 */
export const PrivateAccessModal: React.FC<PrivateAccessModalProps> = ({
  isOpen,
  onClose,
  market,
  onSubmitCode,
}) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setCode('');
    setError('');
  }, [market?.id, isOpen]);

  if (!isOpen || !market) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    const ok = onSubmitCode(market.id, code);
    if (ok) {
      onClose();
    } else {
      setError('Código incorrecto.');
      setCode('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm rounded-2xl bg-[#0f121a] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-[#131620]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">
                Mercado privado
              </h3>
              <p className="text-[11px] text-neutral-400">
                Requiere código de acceso
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

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Identifica el mercado: con varios privados a la vez, sin esto no
              se sabe para cuál es el código. */}
          <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3">
            <div className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider mb-1">
              Mercado
            </div>
            <div className="text-xs font-semibold text-neutral-200 leading-snug">
              {market.title}
            </div>
          </div>

          <p className="text-xs text-neutral-400 leading-relaxed">
            Introduce el código para ver y operar este mercado. Se recordará en
            este navegador.
          </p>

          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              autoFocus
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError('');
              }}
              placeholder="Código de acceso"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#090b0f] border border-neutral-800 focus:border-violet-500/50 focus:outline-none text-sm font-mono text-neutral-100 placeholder:text-neutral-600"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!code.trim()}
            className="w-full py-3 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-bold text-sm transition-all active:scale-98"
          >
            Desbloquear
          </button>
        </form>
      </div>
    </div>
  );
};
