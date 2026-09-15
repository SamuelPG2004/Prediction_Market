import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AlertTriangle, PenLine, ShieldCheck, X } from 'lucide-react';
import { puertaDeFirma, type DetalleFirma } from '../services/signatureGuard';

/** Tabla etiqueta → valor. La comparten la firma suelta y cada paso del plan. */
const Detalles: React.FC<{ detalles: DetalleFirma[] }> = ({ detalles }) => (
  <dl className="flex flex-col gap-px rounded-xl overflow-hidden border border-neutral-800">
    {detalles.map((detalle, indice) => (
      <div
        key={`${detalle.etiqueta}-${indice}`}
        className="flex items-baseline justify-between gap-3 px-3 py-2 bg-neutral-900"
      >
        <dt className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider shrink-0">
          {detalle.etiqueta}
        </dt>
        <dd
          className={`text-right break-all ${
            detalle.destacado === true
              ? 'text-[12.5px] font-bold text-neutral-100'
              : 'text-[11.5px] text-neutral-400'
          }`}
        >
          {detalle.valor}
        </dd>
      </div>
    ))}
  </dl>
);

/**
 * Diálogo de confirmación de firma de la wallet local: el equivalente al
 * popup de MetaMask, que la bóveda de la app no tenía.
 *
 * Se monta una sola vez (en Web3Provider) y escucha la cola de
 * services/signatureGuard.ts. Mientras está abierto, la operación que pidió
 * la firma está literalmente esperando esta decisión.
 *
 * Todo lo que no sea aprobar cuenta como RECHAZAR (la X, Escape, tocar
 * fuera): equivocarse rechazando solo cuesta repetir la operación,
 * equivocarse aprobando puede costar los fondos. Por eso tampoco hay foco
 * automático en el botón de aprobar — un Enter despistado no debe firmar.
 */
export const SignatureConfirmModal: React.FC = () => {
  const peticion = useSyncExternalStore(puertaDeFirma.subscribe, puertaDeFirma.actual);
  const enCola = useSyncExternalStore(puertaDeFirma.subscribe, puertaDeFirma.pendientes);
  const dialogoRef = useRef<HTMLDivElement>(null);

  const rechazar = useCallback(() => {
    if (peticion !== null) puertaDeFirma.rechazar(peticion.id);
  }, [peticion]);

  // Escape rechaza. El foco va al diálogo (no a un botón) para que el lector
  // de pantalla lea la operación y ninguna tecla suelta firme nada.
  useEffect(() => {
    if (peticion === null) return;
    dialogoRef.current?.focus();
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') rechazar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [peticion, rechazar]);

  if (peticion === null) return null;

  const alto = peticion.riesgo === 'alto';
  // Un PLAN agrupa varias firmas en esta única confirmación; una petición
  // suelta no trae `pasos`.
  const pasos = peticion.pasos ?? null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md animate-in fade-in" onClick={rechazar} />

      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-firma"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl bg-[#0f121a] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-150 my-8 outline-none"
      >
        {/* Cabecera */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-[#131620]">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                alto
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}
            >
              <PenLine className="w-4 h-4" />
            </div>
            <div>
              <h3 id="titulo-firma" className="text-sm font-bold text-neutral-100">
                {peticion.titulo}
              </h3>
              <p className="text-[11px] text-neutral-400">
                {pasos === null || pasos.length === 1
                  ? 'Confirma con tu wallet de la app'
                  : `${pasos.length} firmas, una sola confirmación`}
                {enCola > 1 && ` · 1 de ${enCola}`}
              </p>
            </div>
          </div>

          <button
            onClick={rechazar}
            aria-label="Rechazar la firma"
            className="p-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Qué autoriza, en una frase */}
          <p className="text-[12.5px] leading-snug text-neutral-300">{peticion.resumen}</p>

          {alto && (
            <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-[11.5px] leading-snug">
                Operación de alto alcance. Si no la has pedido tú ahora mismo, recházala.
              </p>
            </div>
          )}

          {/* Los datos que hay que mirar: de la firma, o paso a paso si es plan */}
          {pasos === null ? (
            <Detalles detalles={peticion.detalles} />
          ) : (
            <ol className="flex flex-col gap-2.5">
              {pasos.map((paso, indice) => (
                <li key={`${paso.titulo}-${indice}`} className="flex gap-2.5">
                  <span
                    className={`shrink-0 w-5 h-5 mt-0.5 rounded-full grid place-items-center text-[10px] font-bold ${
                      paso.riesgo === 'alto'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {indice + 1}
                  </span>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className="text-[12px] font-bold text-neutral-200">
                      {paso.titulo}
                    </span>
                    <Detalles detalles={paso.detalles} />
                  </div>
                </li>
              ))}
            </ol>
          )}

          {/* Lo que se firma, literal */}
          <details className="group">
            <summary className="cursor-pointer text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors select-none">
              {pasos === null
                ? 'Ver el dato exacto que vas a firmar'
                : 'Ver las operaciones en crudo'}
            </summary>
            <pre className="mt-2 p-3 rounded-xl bg-black/50 border border-neutral-800 text-[10.5px] font-mono text-neutral-400 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
              {peticion.crudo}
            </pre>
          </details>

          <div className="flex gap-2">
            <button
              onClick={rechazar}
              className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold transition-colors active:scale-98"
            >
              Rechazar
            </button>
            <button
              onClick={() => puertaDeFirma.aprobar(peticion.id)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-colors active:scale-98 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {pasos === null || pasos.length === 1
                ? 'Firmar'
                : `Firmar las ${pasos.length}`}
            </button>
          </div>

          <p className="text-[10.5px] leading-snug text-neutral-600 text-center">
            {pasos === null
              ? 'Ninguna firma sale de tu wallet sin pasar por aquí.'
              : 'Solo se firmarán estas operaciones. Cualquier otra volverá a preguntarte.'}
          </p>
        </div>
      </div>
    </div>
  );
};
