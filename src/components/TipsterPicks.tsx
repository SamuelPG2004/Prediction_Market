import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Loader2, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import type { Market } from '../domain/types';
import { marketSources } from '../services/marketSources';
import { formatEventDate } from '../utils/formatters';
import {
  groupMarketsIntoEvents,
  type MarketEventView,
} from '../utils/eventGrouping';

/**
 * Sección "Picks del tipster": lo que propone el bot de /api/tipster-bot
 * (Gemini evaluando el catálogo de Azuro con las reglas de un tipster; ver
 * api/tipster-bot.ts y docs/bot-tipster.md).
 *
 * Dos modos:
 *  - Automático: los picks de la última pasada del bot sobre lo más apostado.
 *  - Elegir partidos: el usuario marca hasta 5 partidos de los destacados y
 *    el bot evalúa SOLO esos (`?gameIds=`). "Cero picks" es respuesta válida:
 *    el método también es saber no apostar.
 *
 * La sección solo existe si el endpoint responde: en dev (sin /api) o con el
 * bot sin configurar (503) desaparece entera, igual que hace la gasolinera.
 *
 * DINERO REAL: el pick abre el panel de apuesta con el resultado
 * preseleccionado, pero jamás apuesta ni rellena importes. El aviso del
 * endpoint se muestra SIEMPRE.
 */

const MAX_SELECTED = 5;

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

type CustomState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; payload: TipsterPayload }
  | { status: 'error' };

export const TipsterPicks: React.FC<{
  /** Partidos entre los que el usuario puede elegir (los destacados). */
  candidateEvents: MarketEventView[];
  /** Abre el panel de apuesta con el resultado del pick preseleccionado. */
  onOpenMarket: (event: MarketEventView, market: Market, outcomeId: string) => void;
}> = ({ candidateEvents, onOpenMarket }) => {
  const [autoPayload, setAutoPayload] = useState<TipsterPayload | null>(null);
  const [mode, setMode] = useState<'auto' | 'elegir'>('auto');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [custom, setCustom] = useState<CustomState>({ status: 'idle' });
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/tipster-bot');
        if (!res.ok) return; // 503 sin configurar, o dev sin /api: sin sección
        const parsed = parsePayload(await res.json());
        if (alive && parsed !== null) setAutoPayload(parsed);
      } catch {
        // Sin red o sin endpoint: la sección simplemente no existe.
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  /** Enfrentamientos elegibles: dos participantes y un id de evento nativo. */
  const candidates = useMemo(
    () =>
      candidateEvents.filter(
        (e) =>
          e.participants !== undefined &&
          e.participants.length === 2 &&
          /^\d+$/.test(e.markets[0]?.group?.id ?? ''),
      ),
    [candidateEvents],
  );

  if (autoPayload === null) return null;

  const toggle = (gameId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else if (next.size < MAX_SELECTED) next.add(gameId);
      return next;
    });
  };

  const askForSelected = async () => {
    if (selected.size === 0 || custom.status === 'loading') return;
    setCustom({ status: 'loading' });
    try {
      const res = await fetch(`/api/tipster-bot?gameIds=${[...selected].join(',')}`);
      if (!res.ok) {
        setCustom({ status: 'error' });
        return;
      }
      const parsed = parsePayload(await res.json());
      setCustom(parsed !== null ? { status: 'ok', payload: parsed } : { status: 'error' });
    } catch {
      setCustom({ status: 'error' });
    }
  };

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

  const shown = mode === 'auto' ? autoPayload : custom.status === 'ok' ? custom.payload : null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] via-transparent to-transparent p-3.5">
      {/* Cabecera + selector de modo */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-violet-500/15 border border-violet-500/30 shrink-0">
          <Bot className="w-4 h-4 text-violet-300" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-wider text-violet-300 leading-none">
            Picks del tipster
          </h2>
          <p className="text-[10px] text-neutral-500 mt-1">
            IA aplicando el método del tipster · experimental
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-xl bg-[#0d1017] border border-neutral-800 p-1">
          <button
            onClick={() => setMode('auto')}
            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-all ${
              mode === 'auto'
                ? 'bg-violet-500/20 text-violet-200'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Automáticos
          </button>
          <button
            onClick={() => setMode('elegir')}
            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-all ${
              mode === 'elegir'
                ? 'bg-violet-500/20 text-violet-200'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Yo elijo los partidos
          </button>
        </div>
      </div>

      {/* Modo elegir: chips de partidos + botón de pedir */}
      {mode === 'elegir' && (
        <div className="flex flex-col gap-2.5">
          {candidates.length === 0 ? (
            <p className="text-[11px] text-neutral-500">
              Ahora mismo no hay partidos destacados entre los que elegir.
            </p>
          ) : (
            <>
              <p className="text-[10.5px] text-neutral-500">
                Marca hasta {MAX_SELECTED} partidos y el tipster evaluará solo esos:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((event) => {
                  const gameId = event.markets[0]!.group!.id;
                  const isOn = selected.has(gameId);
                  const [a, b] = event.participants!;
                  const when = event.markets[0]?.closesAt;
                  return (
                    <button
                      key={event.id}
                      onClick={() => toggle(gameId)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-left transition-all active:scale-95 ${
                        isOn
                          ? 'bg-violet-500/15 border-violet-500/50 text-violet-100'
                          : 'bg-[#0d1017] border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                      }`}
                    >
                      <span
                        className={`flex items-center justify-center w-3.5 h-3.5 rounded-full border shrink-0 ${
                          isOn ? 'bg-violet-400 border-violet-400' : 'border-neutral-600'
                        }`}
                      >
                        {isOn && <Check className="w-2.5 h-2.5 text-neutral-950" />}
                      </span>
                      <span className="text-[11px] font-semibold leading-tight">
                        {a.name} – {b.name}
                        <span className="block text-[9px] font-normal text-neutral-500">
                          {event.leagueName ?? ''}
                          {when != null ? ` · ${formatEventDate(when)}` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void askForSelected()}
                  disabled={selected.size === 0 || custom.status === 'loading'}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-neutral-950 text-[11.5px] font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {custom.status === 'loading' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  {custom.status === 'loading'
                    ? 'Analizando con el método del tipster…'
                    : `Pedir picks (${selected.size})`}
                </button>
                {custom.status === 'ok' && (
                  <button
                    onClick={() => {
                      setSelected(new Set());
                      setCustom({ status: 'idle' });
                    }}
                    className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10.5px] font-semibold text-neutral-400 hover:text-neutral-200 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Empezar de nuevo
                  </button>
                )}
              </div>
              {custom.status === 'error' && (
                <p className="text-[11px] text-amber-300">
                  El tipster está saturado ahora mismo (tier gratuito de la IA).
                  Espera unos segundos y vuelve a pedirlo.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Picks (del modo activo) */}
      {shown !== null &&
        (shown.picks.length === 0 ? (
          <p className="text-[11px] text-neutral-500">
            {mode === 'elegir'
              ? 'El método no ve nada claro en los partidos que elegiste. No forzar picks también es parte del método.'
              : 'El método no ve nada claro en el catálogo de ahora mismo. No forzar picks también es parte del método.'}
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
            {shown.picks.map((pick) => (
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
                  <span className="font-mono font-bold text-[12px] text-emerald-400 shrink-0">
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
        ))}

      {/* El aviso del endpoint, siempre visible: esto no es consejo financiero. */}
      <p className="text-[9.5px] text-neutral-600 leading-snug max-w-3xl">
        {autoPayload.aviso}
      </p>
    </section>
  );
};
