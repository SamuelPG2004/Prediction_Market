import React, { useEffect, useState } from 'react';
import { Bot, Loader2, Sparkles } from 'lucide-react';
import type { Market } from '../domain/types';
import { marketSources } from '../services/marketSources';
import {
  groupMarketsIntoEvents,
  type MarketEventView,
} from '../utils/eventGrouping';

/**
 * Sección "Picks del tipster": lo que propone el bot de /api/tipster-bot
 * (Gemini evaluando el catálogo de Azuro con las reglas de un tipster; ver
 * api/tipster-bot.ts y docs/bot-tipster.md).
 *
 * La sección solo existe si el endpoint responde: en dev (sin /api) o con el
 * bot sin configurar (503: falta la clave o las transcripciones) desaparece
 * entera, igual que hace la gasolinera. Con el bot activo pero sin picks, se
 * muestra el "hoy no veo nada claro": que el método no fuerce picks es parte
 * del método, y ocultarlo parecería un fallo.
 *
 * DINERO REAL: el pick abre el panel de apuesta con el resultado
 * preseleccionado, pero jamás apuesta ni rellena importes. El aviso del
 * endpoint se muestra SIEMPRE.
 */

interface TipsterPick {
  marketId: string;
  outcomeId: string;
  partido: string;
  liga: string;
  deporte: string;
  mercado: string;
  resultado: string;
  cuota: number;
  stakeUnits: number;
  confianza: number;
  regla: string;
  razon: string;
}

interface TipsterPayload {
  generatedAt: string;
  partidosEvaluados: number;
  picks: TipsterPick[];
  aviso: string;
}

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null;
}

/** Valida la respuesta del endpoint propio; un pick malformado se descarta. */
function parsePayload(u: unknown): TipsterPayload | null {
  if (!isRecord(u) || typeof u.generatedAt !== 'string') return null;
  if (typeof u.aviso !== 'string' || !Array.isArray(u.picks)) return null;
  const picks: TipsterPick[] = [];
  for (const p of u.picks) {
    if (!isRecord(p)) continue;
    if (
      typeof p.marketId !== 'string' ||
      typeof p.outcomeId !== 'string' ||
      typeof p.partido !== 'string' ||
      typeof p.liga !== 'string' ||
      typeof p.deporte !== 'string' ||
      typeof p.mercado !== 'string' ||
      typeof p.resultado !== 'string' ||
      typeof p.regla !== 'string' ||
      typeof p.razon !== 'string' ||
      typeof p.cuota !== 'number' ||
      typeof p.stakeUnits !== 'number' ||
      typeof p.confianza !== 'number'
    ) {
      continue;
    }
    picks.push(p as unknown as TipsterPick);
  }
  return {
    generatedAt: u.generatedAt,
    partidosEvaluados: typeof u.partidosEvaluados === 'number' ? u.partidosEvaluados : 0,
    picks,
    aviso: u.aviso,
  };
}

export const TipsterPicks: React.FC<{
  /** Abre el panel de apuesta con el resultado del pick preseleccionado. */
  onOpenMarket: (event: MarketEventView, market: Market, outcomeId: string) => void;
}> = ({ onOpenMarket }) => {
  const [payload, setPayload] = useState<TipsterPayload | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/tipster-bot');
        if (!res.ok) return; // 503 sin configurar, o dev sin /api: sin sección
        const parsed = parsePayload(await res.json());
        if (alive && parsed !== null) setPayload(parsed);
      } catch {
        // Sin red o sin endpoint: la sección simplemente no existe.
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  if (payload === null) return null;

  /** El pick trae el marketId del dominio: se resuelve y se abre el panel. */
  const openPick = async (pick: TipsterPick) => {
    if (openingId !== null) return;
    setOpeningId(pick.marketId);
    try {
      const source = marketSources.sourceFor(pick.marketId);
      if (source === null) return;
      const result = await source.getMarket(pick.marketId);
      if (!result.ok || result.data === null) return;
      const [event] = groupMarketsIntoEvents([result.data]);
      if (event !== undefined) onOpenMarket(event, result.data, pick.outcomeId);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Bot className="w-3.5 h-3.5 text-violet-400" />
        <h2 className="text-xs font-bold uppercase tracking-wider text-violet-300">
          Picks del tipster
        </h2>
        <span className="text-[10px] font-mono text-neutral-600">
          IA experimental · {payload.partidosEvaluados} partidos evaluados
        </span>
      </div>

      {payload.picks.length === 0 ? (
        <p className="text-[11px] text-neutral-500">
          El método no ve nada claro en el catálogo de ahora mismo. No forzar
          picks también es parte del método.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
          {payload.picks.map((pick) => (
            <div
              key={`${pick.marketId}:${pick.outcomeId}`}
              className="w-[290px] shrink-0 snap-start rounded-2xl bg-[#0d1017] border border-violet-500/25 hover:border-violet-500/45 transition-colors p-3.5 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9.5px] font-mono uppercase tracking-wide text-neutral-400 truncate">
                  {pick.deporte} · {pick.liga}
                </span>
                <span
                  className="text-[9px] font-mono font-semibold text-violet-300 shrink-0"
                  title="Confianza declarada por la IA (no es una probabilidad calibrada)"
                >
                  {Math.round(pick.confianza * 100)}%
                </span>
              </div>

              <p className="text-[12.5px] font-semibold text-neutral-100 leading-tight line-clamp-1">
                {pick.partido}
              </p>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-[#12151d] border border-neutral-800 px-2.5 py-2">
                <span className="text-[11px] text-neutral-300 truncate">
                  {pick.mercado} · <span className="font-semibold">{pick.resultado}</span>
                </span>
                <span className="font-mono font-bold text-[12px] text-violet-300 shrink-0">
                  {pick.cuota.toFixed(2)}
                </span>
              </div>

              <p
                className="text-[10.5px] text-neutral-500 leading-snug line-clamp-3"
                title={`Regla aplicada: ${pick.regla}\n\n${pick.razon}`}
              >
                {pick.razon}
              </p>

              <div className="flex items-center justify-between gap-2 mt-auto">
                <span
                  className="text-[9.5px] font-mono text-neutral-500"
                  title="Stake sugerido en la escala del tipster (1-3 unidades)"
                >
                  stake {'●'.repeat(pick.stakeUnits)}{'○'.repeat(Math.max(0, 3 - pick.stakeUnits))}
                </span>
                <button
                  onClick={() => void openPick(pick)}
                  disabled={openingId !== null}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-[10.5px] font-semibold text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-50"
                >
                  {openingId === pick.marketId ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Ver mercado
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* El aviso del endpoint, siempre visible: esto no es consejo financiero. */}
      <p className="text-[9.5px] text-neutral-600 leading-snug max-w-3xl">
        {payload.aviso}
      </p>
    </section>
  );
};
