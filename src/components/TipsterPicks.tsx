import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Loader2,
  MessageCircle,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { Market } from '../domain/types';
import { marketSources } from '../services/marketSources';
import { formatEventDate } from '../utils/formatters';
import {
  groupMarketsIntoEvents,
  type MarketEventView,
} from '../utils/eventGrouping';
import { SUGGESTION_MIN_CHARS } from '../utils/searchIndex';

/**
 * Sección "Picks del tipster": lo que propone el bot de /api/tipster-bot
 * (Gemini evaluando el catálogo de Azuro con las reglas de un tipster; ver
 * api/tipster-bot.ts y docs/bot-tipster.md).
 *
 * Tres modos:
 *  - Automático: los picks de la última pasada del bot sobre lo más apostado.
 *  - Elegir partidos: el usuario marca hasta 5 partidos de los destacados y
 *    el bot evalúa SOLO esos (`?gameIds=`). "Cero picks" es respuesta válida:
 *    el método también es saber no apostar.
 *  - Preguntar (chat): el usuario busca CUALQUIER partido del sportsbook (la
 *    búsqueda va al servidor del venue, no solo a los destacados), pregunta, y
 *    el bot responde con pronóstico + picks (/api/tipster-chat, con forma
 *    reciente de los equipos y cupo limitado por el tier gratuito de la IA).
 *
 * La sección solo existe si el endpoint responde: con el bot sin configurar
 * (503) desaparece entera, igual que hace la gasolinera. Un fallo transitorio
 * (pasada fría que agota el tiempo, cuota de la IA) se reintenta una vez.
 *
 * DINERO REAL: el pick abre el panel de apuesta con el resultado
 * preseleccionado, pero jamás apuesta ni rellena importes. El aviso del
 * endpoint se muestra SIEMPRE.
 */

const MAX_SELECTED = 5;
/** Resultados de búsqueda que se ofrecen en el chat. */
const MAX_SEARCH_RESULTS = 8;

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

/** Valida un pick del endpoint propio; malformado → null. */
function parsePick(p: unknown): TipsterPick | null {
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

/** Valida la respuesta del endpoint propio; un pick malformado se descarta. */
function parsePayload(u: unknown): TipsterPayload | null {
  if (!isRecord(u) || typeof u.generatedAt !== 'string') return null;
  if (typeof u.aviso !== 'string' || !Array.isArray(u.picks)) return null;
  const picks: TipsterPick[] = [];
  for (const p of u.picks) {
    const pick = parsePick(p);
    if (pick !== null) picks.push(pick);
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

/** Un turno del chat. Los del bot pueden traer picks accionables. */
interface ChatMessage {
  de: 'usuario' | 'bot';
  texto: string;
  picks?: TipsterPick[];
}

/** Partido elegido en el chat, con lo mínimo para pintarlo y pedirlo. */
interface ChatGame {
  gameId: string;
  titulo: string;
  liga: string;
  cuando: Date | null;
}

/** Tarjeta de pick, compartida entre el listado y las respuestas del chat. */
const PickCard: React.FC<{
  pick: TipsterPick;
  opening: boolean;
  disabled: boolean;
  onOpen: (pick: TipsterPick) => void;
  compact?: boolean;
}> = ({ pick, opening, disabled, onOpen, compact = false }) => (
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
        Ver mercado
      </button>
    </div>
  </div>
);

export const TipsterPicks: React.FC<{
  /** Partidos entre los que el usuario puede elegir (los destacados). */
  candidateEvents: MarketEventView[];
  /** Abre el panel de apuesta con el resultado del pick preseleccionado. */
  onOpenMarket: (event: MarketEventView, market: Market, outcomeId: string) => void;
}> = ({ candidateEvents, onOpenMarket }) => {
  const [autoPayload, setAutoPayload] = useState<TipsterPayload | null>(null);
  const [mode, setMode] = useState<'auto' | 'elegir' | 'chat'>('auto');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [custom, setCustom] = useState<CustomState>({ status: 'idle' });
  const [openingId, setOpeningId] = useState<string | null>(null);

  // --- Estado del chat ---
  const [chatQuery, setChatQuery] = useState('');
  const [chatResults, setChatResults] = useState<MarketEventView[]>([]);
  const [chatSearching, setChatSearching] = useState(false);
  const [chatGame, setChatGame] = useState<ChatGame | null>(null);
  const [pregunta, setPregunta] = useState('');
  const [charla, setCharla] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [restantes, setRestantes] = useState<{ hora: number; dia: number } | null>(null);
  const charlaEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    let retryTimer: number | undefined;
    const load = async (retriesLeft: number) => {
      try {
        const res = await fetch('/api/tipster-bot');
        if (res.status === 503) return; // sin configurar: sin sección
        if (!res.ok) throw new Error(String(res.status));
        const parsed = parsePayload(await res.json());
        if (alive && parsed !== null) setAutoPayload(parsed);
      } catch {
        // Fallo transitorio (pasada fría que agotó el tiempo, red): un
        // reintento; si tampoco, la sección no existe en esta visita.
        if (alive && retriesLeft > 0) {
          retryTimer = window.setTimeout(() => void load(retriesLeft - 1), 6000);
        }
      }
    };
    void load(1);
    return () => {
      alive = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
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

  // Búsqueda de partidos del chat: va al servidor del venue de deportes, así
  // que encuentra cualquier partido del catálogo, no solo los destacados.
  useEffect(() => {
    const q = chatQuery.trim();
    if (q.length < SUGGESTION_MIN_CHARS) {
      setChatResults([]);
      setChatSearching(false);
      return;
    }
    let alive = true;
    setChatSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const source = marketSources.byVenue('azuro');
        if (source === null) return;
        const result = await source.listMarkets({
          category: 'sports',
          query: q,
          limit: 40,
        });
        if (!alive || !result.ok) return;
        const events = groupMarketsIntoEvents(result.data.markets).filter((e) =>
          /^\d+$/.test(e.markets[0]?.group?.id ?? ''),
        );
        setChatResults(events.slice(0, MAX_SEARCH_RESULTS));
      } catch {
        // Búsqueda caída: se deja la lista como esté.
      } finally {
        if (alive) setChatSearching(false);
      }
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [chatQuery]);

  // El chat se desplaza solo al último mensaje.
  useEffect(() => {
    charlaEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [charla, chatSending]);

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

  /** Elegir partido en el chat: fija el contexto y limpia la búsqueda. */
  const pickChatGame = (event: MarketEventView) => {
    const gameId = event.markets[0]?.group?.id;
    if (gameId === undefined) return;
    const [a, b] = event.participants ?? [];
    setChatGame({
      gameId,
      titulo:
        a !== undefined && b !== undefined ? `${a.name} – ${b.name}` : event.title,
      liga: event.leagueName ?? '',
      cuando: event.markets[0]?.closesAt ?? null,
    });
    setChatQuery('');
    setChatResults([]);
    setCharla([]);
    setRestantes(null);
  };

  /** Manda la pregunta (o pide pronóstico general) al chat del tipster. */
  const sendChat = async () => {
    if (chatGame === null || chatSending) return;
    const texto = pregunta.trim();
    setPregunta('');
    setChatSending(true);
    setCharla((prev) => [
      ...prev,
      { de: 'usuario', texto: texto !== '' ? texto : 'Dame tu pronóstico del partido.' },
    ]);
    try {
      const res = await fetch('/api/tipster-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: chatGame.gameId,
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
      setChatSending(false);
    }
  };

  const shown = mode === 'auto' ? autoPayload : mode === 'elegir' && custom.status === 'ok' ? custom.payload : null;

  const modeButton = (m: 'auto' | 'elegir' | 'chat', label: React.ReactNode) => (
    <button
      onClick={() => setMode(m)}
      className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition-all ${
        mode === m
          ? 'bg-violet-500/20 text-violet-200'
          : 'text-neutral-500 hover:text-neutral-300'
      }`}
    >
      {label}
    </button>
  );

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
          {modeButton('auto', 'Automáticos')}
          {modeButton('elegir', 'Yo elijo los partidos')}
          {modeButton(
            'chat',
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              Preguntar
            </span>,
          )}
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

      {/* Modo chat: buscar cualquier partido y preguntarle al tipster */}
      {mode === 'chat' && (
        <div className="flex flex-col gap-2.5">
          {chatGame === null ? (
            <>
              <p className="text-[10.5px] text-neutral-500">
                Busca cualquier partido del sportsbook (equipo o liga) y pregúntale al
                tipster por él:
              </p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
                <input
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                  placeholder="Real Madrid, Boca, Eredivisie…"
                  className="w-full rounded-xl bg-[#0d1017] border border-neutral-800 focus:border-violet-500/50 outline-none pl-8 pr-3 py-2 text-[12px] text-neutral-200 placeholder:text-neutral-600"
                />
                {chatSearching && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 animate-spin" />
                )}
              </div>
              {chatResults.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {chatResults.map((event) => {
                    const [a, b] = event.participants ?? [];
                    const when = event.markets[0]?.closesAt;
                    return (
                      <button
                        key={event.id}
                        onClick={() => pickChatGame(event)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border bg-[#0d1017] border-neutral-800 text-neutral-300 hover:border-violet-500/50 hover:text-violet-100 text-left transition-all active:scale-95"
                      >
                        <span className="text-[11px] font-semibold leading-tight">
                          {a !== undefined && b !== undefined
                            ? `${a.name} – ${b.name}`
                            : event.title}
                          <span className="block text-[9px] font-normal text-neutral-500">
                            {event.leagueName ?? ''}
                            {when != null ? ` · ${formatEventDate(when)}` : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {chatQuery.trim().length >= SUGGESTION_MIN_CHARS &&
                !chatSearching &&
                chatResults.length === 0 && (
                  <p className="text-[11px] text-neutral-500">
                    Sin partidos que casen con esa búsqueda ahora mismo.
                  </p>
                )}
            </>
          ) : (
            <>
              {/* Partido en contexto */}
              <div className="flex items-center gap-2 rounded-xl bg-[#0d1017] border border-violet-500/30 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-semibold text-neutral-100 leading-tight truncate">
                    {chatGame.titulo}
                  </span>
                  <span className="block text-[9.5px] text-neutral-500">
                    {chatGame.liga}
                    {chatGame.cuando !== null ? ` · ${formatEventDate(chatGame.cuando)}` : ''}
                  </span>
                </span>
                <button
                  onClick={() => {
                    setChatGame(null);
                    setCharla([]);
                    setRestantes(null);
                  }}
                  className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-neutral-400 hover:text-neutral-200 transition-colors shrink-0"
                  title="Cambiar de partido"
                >
                  <X className="w-3 h-3" />
                  Cambiar
                </button>
              </div>

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
                              onOpen={(p) => void openPick(p)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {chatSending && (
                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      El tipster está mirando el partido…
                    </div>
                  )}
                  <div ref={charlaEndRef} />
                </div>
              )}

              {/* Entrada */}
              <div className="flex items-center gap-2">
                <input
                  value={pregunta}
                  onChange={(e) => setPregunta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sendChat();
                  }}
                  maxLength={300}
                  placeholder="¿Qué le ves a este partido? (o pide el pronóstico sin más)"
                  className="flex-1 rounded-xl bg-[#0d1017] border border-neutral-800 focus:border-violet-500/50 outline-none px-3 py-2 text-[12px] text-neutral-200 placeholder:text-neutral-600"
                />
                <button
                  onClick={() => void sendChat()}
                  disabled={chatSending}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-neutral-950 text-[11.5px] font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {chatSending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {charla.length === 0 ? 'Pedir pronóstico' : 'Enviar'}
                </button>
              </div>
              {restantes !== null && (
                <p className="text-[9.5px] text-neutral-600">
                  Te quedan {restantes.hora} consultas esta hora (cupo del tier gratuito
                  de la IA).
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Picks (del modo activo) */}
      {mode !== 'chat' &&
        shown !== null &&
        (shown.picks.length === 0 ? (
          <p className="text-[11px] text-neutral-500">
            {mode === 'elegir'
              ? 'El método no ve nada claro en los partidos que elegiste. No forzar picks también es parte del método.'
              : 'El método no ve nada claro en el catálogo de ahora mismo. No forzar picks también es parte del método.'}
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
            {shown.picks.map((pick) => (
              <PickCard
                key={`${pick.marketId}:${pick.outcomeId}`}
                pick={pick}
                opening={openingId === pick.marketId}
                disabled={openingId !== null}
                onOpen={(p) => void openPick(p)}
              />
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
