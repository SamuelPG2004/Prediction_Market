import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, PartyPopper } from 'lucide-react';
import confetti from 'canvas-confetti';
import { QrCodeCanvas } from './QrCodeCanvas';

/**
 * Guía de depósito desde Binance, para quien no sabe qué es una red: los
 * pasos exactos del retiro (USDT por Polygon, con la red imposible de no
 * ver), el QR que la app de Binance escanea directamente, y VIGILANCIA del
 * ingreso: mientras la pantalla está abierta se re-lee el saldo y, cuando el
 * dinero aterriza, se celebra con el importe exacto. Así el usuario nunca se
 * queda con la duda de "¿habrá llegado?".
 *
 * Solo cubre USDT/Polygon (el plan de pruebas con amigos usa Azuro); el modo
 * avanzado de la pantalla de depósito sigue mostrando todas las redes.
 */
export const BinanceDepositGuide: React.FC<{
  address: `0x${string}`;
  /** Saldo actual de USDT en Polygon (unidades humanas), o null cargando. */
  balance: number | null;
  /** Re-lee los saldos; se invoca en bucle mientras la guía está abierta. */
  refetch: () => void;
}> = ({ address, balance, refetch }) => {
  const [copied, setCopied] = useState(false);
  /** Saldo al abrir la guía; contra él se detecta el ingreso. */
  const baselineRef = useRef<number | null>(null);
  const [arrived, setArrived] = useState<number | null>(null);

  // Sondeo del saldo más vivo que el refresco general: un retiro de Binance
  // por Polygon tarda 1-2 minutos y la gracia es celebrarlo al momento.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refetch();
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [refetch]);

  useEffect(() => {
    if (balance === null) return;
    if (baselineRef.current === null) {
      baselineRef.current = balance;
      return;
    }
    // Umbral de céntimo: los redondeos de formatUnits no son un depósito.
    const delta = balance - baselineRef.current;
    if (delta > 0.01) {
      baselineRef.current = balance;
      setArrived(delta);
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
    }
  }, [balance]);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const step = (n: number, content: React.ReactNode) => (
    <div className="flex items-start gap-2.5">
      <span className="w-5 h-5 shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="flex-1 text-[11px] text-neutral-300 leading-relaxed">{content}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {arrived !== null && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 p-3 text-xs font-bold text-emerald-300">
          <PartyPopper className="w-4 h-4 shrink-0" />
          <span>
            ¡Llegaron {arrived.toFixed(2)} USDT! Ya puedes apostar.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {step(
          1,
          <>
            Abre <span className="font-bold text-neutral-100">Binance</span> →{' '}
            <span className="font-bold text-neutral-100">Retirar</span> → elige{' '}
            <span className="font-bold text-neutral-100">USDT</span>.
          </>,
        )}
        {step(
          2,
          <>
            <span>En "Red" elige</span>
            <span className="mx-1.5 inline-flex items-center px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-400/40 font-bold text-violet-300">
              Polygon
            </span>
            <span>
              — a veces aparece como "Polygon POS" o "MATIC". Nunca Ethereum
              (ERC20) ni BNB (BEP20): por otra red el dinero se pierde.
            </span>
          </>,
        )}
        {step(
          3,
          <>
            En "Dirección", toca el icono de escanear y apunta a este QR (o
            copia la dirección de abajo y pégala).
          </>,
        )}
        {step(
          4,
          <>
            Envía <span className="font-bold text-neutral-100">10 USDT o más</span>{' '}
            (el mínimo de Binance). Suele llegar en 1-2 minutos y esta pantalla
            avisará sola.
          </>,
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="p-2 rounded-xl bg-white">
          <QrCodeCanvas value={address} />
        </div>
        <div className="w-full rounded-lg bg-[#090b0f] border border-neutral-800 p-2.5 flex items-start gap-2">
          <span className="flex-1 text-[11px] font-mono text-neutral-200 break-all select-all">
            {address}
          </span>
          <button
            onClick={handleCopy}
            title="Copiar dirección"
            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Estado vivo: el usuario ve que la app está mirando por él. */}
      <div className="flex items-center justify-between rounded-lg bg-[#090b0f] border border-neutral-800 p-2.5 text-[11px] font-mono">
        <span className="flex items-center gap-2 text-neutral-400">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
          </span>
          <span>Vigilando el ingreso…</span>
        </span>
        <span className="text-neutral-200 tabular-nums">
          {balance !== null ? `${balance.toFixed(2)} USDT` : '—'}
        </span>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-[11px] text-amber-200/90">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Con USDT basta para apostar: la primera apuesta descuenta 0,10 USDT
          de comisión de activación y no hace falta comprar nada más.
        </span>
      </div>
    </div>
  );
};
