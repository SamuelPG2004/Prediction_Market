import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';

/**
 * Chat del tipster para UN partido concreto: pide pronóstico y preguntas a
 * POST /api/tipster-chat (Gemini con el método del tipster + cuotas reales +
 * forma raspada; ver api/tipster-chat.ts y docs/bot-tipster.md).
 *
 * Reutilizable: vive dentro de la sección de portada (TipsterPicks, tras
 * buscar un partido) y dentro del panel de apuesta (TradePanel, para el
 * evento abierto). El padre decide qué hace el botón de cada pick con
 * `onPick` (abrir el mercado, o preseleccionarlo en el panel).
 *
 * DINERO REAL: el bot solo propone; apostar es siempre un acto humano. El
 * cupo del tier gratuito lo corta el servidor (429 con motivo) y aquí solo
 * se muestra.
 */

export interface TipsterPick {
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

export function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === 'object' && u !== null;
}

/** Valida un pick del endpoint propio; malformado → null. */
export function parsePick(p: unknown): TipsterPick | null {
  if (!isRecord(p)) return null;
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
    return null;
  }
  return p as unknown as TipsterPick;
}

/** Tarjeta de pick, compartida entre el listado de portada y los chats. */
export const PickCard: React.FC<{
  pick: TipsterPick;
  opening: boolean;
  disabled: boolean;
  onOpen: (pick: TipsterPick) => void;
  /** Texto del botón de acción ("Ver mercado", "Usar esta selección"…). */
  actionLabel?: string;
  compact?: boolean;
}> = ({ pick, opening, disabled, onOpen, actionLabel = 'Ver mercado', compact = false }) => (
  <div
    className={`${
      compact ? 'w-full' : 'w-[290px] shrink-0 snap-start'
    } rounded-2xl bg-[#0d1017] border border-violet-500/25 hover:border-violet-500/45 transition-colors p-3.5 flex flex-col gap-2`}
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

    {!compact && (
      <p
        className="text-[10.5px] text-neutral-500 leading-snug line-clamp-3"
        title={`Regla aplicada: ${pick.regla}\n\n${pick.razon}`}
      >
        {pick.razon}
      </p>
    )}

    <div className="flex items-center justify-between gap-2 mt-auto">
      <span
        className="text-[9.5px] font-mono text-neutral-500"
        title="Stake sugerido en la escala del tipster (1-3 unidades)"
      >
        stake {'●'.repeat(pick.stakeUnits)}{'○'.repeat(Math.max(0, 3 - pick.stakeUnits))}
      </span>
      <button
        onClick={() => onOpen(pick)}
        disabled={disabled}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-[10.5px] font-semibold text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-50"
      >
        {opening ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        {actionLabel}
      </button>
    </div>
  </div>
);

/** Un turno del chat. Los del bot pueden traer picks accionables. */
interface ChatMessage {
  de: 'usuario' | 'bot';
  texto: string;
  picks?: TipsterPick[];
}

export const TipsterChat: React.FC<{
  /** Id nativo de Azuro del partido (el `group.id` del evento). */
  gameId: string;
  /** Qué hace el botón de cada pick propuesto. */
  onPick: (pick: TipsterPick) => void;
  /** Texto del botón del pick (por defecto "Ver mercado"). */
  pickLabel?: string;
  /** Id del pick que se está abriendo (spinner), si el padre lo gestiona. */
  openingId?: string | null;
}> = ({ gameId, onPick, pickLabel = 'Ver mercado', openingId = null }) => {
  const [charla, setCharla] = useState<ChatMessage[]>([]);
  const [pregunta, setPregunta] = useState('');
  const [sending, setSending] = useState(false);
  const [restantes, setRestantes] = useState<{ hora: number; dia: number } | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Cambiar de partido = conversación nueva (el consejo no viaja entre partidos).
  useEffect(() => {
    setCharla([]);
    setPregunta('');
    setRestantes(null);
  }, [gameId]);

  // El chat se desplaza solo al último mensaje.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [charla, sending]);

  /** Manda la pregunta (o pide el pronóstico general) al chat del tipster. */
  const send = async () => {
    if (sending) return;
    const texto = pregunta.trim();
    setPregunta('');
    setSending(true);
    setCharla((prev) => [
      ...prev,
      { de: 'usuario', texto: texto !== '' ? texto : 'Dame tu pronóstico del partido.' },
    ]);
    try {
      const res = await fetch('/api/tipster-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId,
          ...(texto !== '' ? { pregunta: texto } : {}),
        }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (res.status === 429) {
        const motivo =
          isRecord(body) && typeof body.motivo === 'string'
            ? body.motivo
            : 'Cupo de consultas agotado por ahora.';
        setCharla((prev) => [...prev, { de: 'bot', texto: motivo }]);
        return;
      }
      if (!res.ok || !isRecord(body) || typeof body.respuesta !== 'string') {
        setCharla((prev) => [
          ...prev,
          {
            de: 'bot',
            texto:
              'No pude analizar ese partido ahora mismo (¿empezó ya, o la IA está saturada?). Prueba en unos segundos.',
          },
        ]);
        return;
      }
      const picks: TipsterPick[] = [];
      if (Array.isArray(body.picks)) {
        for (const p of body.picks) {
          const pick = parsePick(p);
          if (pick !== null) picks.push(pick);
        }
      }
      if (
        isRecord(body.restantes) &&
        typeof body.restantes.hora === 'number' &&
        typeof body.restantes.dia === 'number'
      ) {
        setRestantes({ hora: body.restantes.hora, dia: body.restantes.dia });
      }
      setCharla((prev) => [
        ...prev,
        { de: 'bot', texto: body.respuesta as string, ...(picks.length > 0 ? { picks } : {}) },
      ]);
    } catch {
      setCharla((prev) => [
        ...prev,
        { de: 'bot', texto: 'Se cortó la conexión con el tipster. Vuelve a intentarlo.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Conversación */}
      {charla.length > 0 && (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
          {charla.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col gap-2 ${
                msg.de === 'usuario' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11.5px] leading-snug whitespace-pre-wrap ${
                  msg.de === 'usuario'
                    ? 'bg-violet-500/20 border border-violet-500/30 text-violet-100'
                    : 'bg-[#0d1017] border border-neutral-800 text-neutral-300'
                }`}
              >
                {msg.texto}
              </div>
              {msg.picks !== undefined && (
                <div className="flex flex-col gap-2 w-full max-w-[85%]">
                  {msg.picks.map((pick) => (
                    <PickCard
                      key={`${pick.marketId}:${pick.outcomeId}`}
                      pick={pick}
                      compact
                      opening={openingId === pick.marketId}
                      disabled={openingId !== null}
                      onOpen={onPick}
                      actionLabel={pickLabel}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              El tipster está mirando el partido…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {/* Entrada */}
      <div className="flex items-center gap-2">
        <input
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          maxLength={300}
          placeholder="¿Qué le ves a este partido? (o pide el pronóstico sin más)"
          className="flex-1 rounded-xl bg-[#0d1017] border border-neutral-800 focus:border-violet-500/50 outline-none px-3 py-2 text-[12px] text-neutral-200 placeholder:text-neutral-600"
        />
        <button
          onClick={() => void send()}
          disabled={sending}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-neutral-950 text-[11.5px] font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          {charla.length === 0 ? 'Pedir pronóstico' : 'Enviar'}
        </button>
      </div>
      {restantes !== null && (
        <p className="text-[9.5px] text-neutral-600">
          Te quedan {restantes.hora} consultas esta hora (cupo del tier gratuito de la
          IA).
        </p>
      )}
    </div>
  );
};
