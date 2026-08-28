import React, { useEffect, useState } from 'react';
import {
  X,
  Wallet,
  Check,
  Copy,
  LogOut,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Eye,
} from 'lucide-react';
import { useWallet } from '../services/web3Service';
import { useVenueBalances } from '../hooks/useVenueBalances';
import { chainLabel, explorerAddressUrl } from '../config/chains';
import { formatCurrency, shortenAddress } from '../utils/formatters';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Forma mínima del conector que usa este modal. */
interface ConnectorLike {
  uid: string;
  id: string;
  name: string;
  type: string;
}

/**
 * wagmi lista los conectores configurados Y las wallets inyectadas que el
 * navegador anuncia (EIP-6963), así que una misma wallet puede aparecer dos
 * veces y el genérico "Injected" sobra cuando hay wallets con nombre propio
 * — o cuando no hay NINGUNA extensión instalada (sería un botón muerto).
 */
function dedupeConnectors<T extends ConnectorLike>(connectors: readonly T[]): T[] {
  const hasInjectedProvider =
    typeof window !== 'undefined' &&
    (window as unknown as { ethereum?: unknown }).ethereum !== undefined;
  const named = connectors.filter((c) => c.id !== 'injected');
  const base =
    named.length > 0 || !hasInjectedProvider
      ? named
      : connectors;
  const seen = new Set<string>();
  return base.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Traduce los errores de conexión más comunes a algo accionable. */
function humanConnectError(error: Error): string {
  const message = error.message;
  if (/provider.*not.*(found|available)|no.*provider/i.test(message)) {
    return 'Esa wallet no está instalada en este navegador. Instala su extensión, o conecta una wallet móvil por WalletConnect (ver abajo).';
  }
  if (/rejected|denied/i.test(message)) {
    return 'Has cancelado la conexión en la wallet.';
  }
  if (/already (pending|processing)|-32002/i.test(message)) {
    return 'La wallet ya tiene una petición de conexión pendiente de otro intento. Abre la extensión desde la barra del navegador, resuélvela (o desbloquéala) y vuelve a intentarlo.';
  }
  return message;
}

/**
 * Tras este tiempo conectando se enseña una pista: las extensiones (Binance
 * Wallet en Edge, típicamente) dejan la petición colgada en silencio si están
 * bloqueadas o su popup no llegó a abrirse.
 */
const SLOW_CONNECT_HINT_MS = 6_000;

/**
 * Conexión de wallet, vía wagmi. Conectar te da tu dirección y muestra tus
 * saldos reales de los tokens de apuesta de cada venue. Las operaciones se
 * firman siempre una a una desde el panel de apuesta.
 */
export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    address,
    isConnected,
    connect,
    connectors,
    isConnecting,
    connectError,
    disconnect,
  } = useWallet();
  const { balances, isLoading: balancesLoading } = useVenueBalances();

  const [copied, setCopied] = useState(false);
  /** uid del conector cuyo intento sigue vivo; null si no hay ninguno. */
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const connectorList = dedupeConnectors(connectors);

  // La pista de "esto va lento" solo tras un rato con un intento colgado.
  useEffect(() => {
    if (pendingUid === null || !isConnecting) {
      setShowSlowHint(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSlowHint(true), SLOW_CONNECT_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [pendingUid, isConnecting]);

  if (!isOpen) return null;

  const handleConnect = (connector: (typeof connectors)[number]) => {
    const uid = connector.uid;
    setPendingUid(uid);
    connect(
      { connector },
      {
        // Solo limpia si el intento que terminó es el último lanzado; un
        // intento colgado que muera tarde no debe pisar un reintento nuevo.
        onSettled: () => {
          setPendingUid((current) => (current === uid ? null : current));
        },
      },
    );
  };

  const handleCopy = () => {
    if (address === null) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm rounded-2xl bg-[#0f121a] border border-neutral-800 shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-150">
        {/* Cabecera */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-[#131620]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">
                {isConnected ? 'Wallet conectada' : 'Conectar wallet'}
              </h3>
              <p className="text-[11px] text-neutral-400">
                Cada operación se firma una a una
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

        <div className="p-5 flex flex-col gap-4">
          {isConnected && address !== null ? (
            <>
              {/* Dirección */}
              <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3.5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
                    Dirección
                  </span>
                  <div className="flex items-center gap-1">
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
                    {explorerAddressUrl(137, address) !== null && (
                      <a
                        href={explorerAddressUrl(137, address) ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver en el explorador"
                        className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
                <span className="text-sm font-mono text-neutral-100 break-all">
                  {shortenAddress(address, 8)}
                </span>
              </div>

              {/* Saldos por venue, solo lectura */}
              <div className="rounded-xl bg-[#090b0f] border border-neutral-800 p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3 h-3 text-neutral-500" />
                  <span className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
                    Saldos de apuesta · solo lectura
                  </span>
                </div>
                {balances.map((b) => (
                  <div
                    key={b.venue}
                    className="flex items-center justify-between text-xs font-mono"
                  >
                    <span className="text-neutral-500">
                      {b.symbol} · {chainLabel(b.chainId)}
                    </span>
                    <span className="font-bold text-neutral-100">
                      {balancesLoading && b.balance === null ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500" />
                      ) : b.balance === null ? (
                        '—'
                      ) : (
                        formatCurrency(b.balance)
                      )}
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  La app no mueve estos saldos sin una firma tuya por operación.
                </p>
              </div>

              <button
                onClick={() => {
                  disconnect();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-bold text-rose-400 transition-all active:scale-95"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Desconectar</span>
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Puedes explorar los mercados sin conectar nada. Conectar añade
                tu dirección y permite cotizar y apostar con fondos reales.
              </p>

              <div className="flex flex-col gap-2">
                {connectorList.map((connector) => {
                  const isThisPending =
                    isConnecting && pendingUid === connector.uid;
                  return (
                    <button
                      key={connector.uid}
                      onClick={() => handleConnect(connector)}
                      // Un intento colgado (pista visible) reabre el botón
                      // para poder reintentar sin recargar la página.
                      disabled={isThisPending && !showSlowHint}
                      className="flex items-center justify-between px-4 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/30 text-sm font-semibold text-neutral-200 transition-all active:scale-98 disabled:opacity-50"
                    >
                      <span>{connector.name}</span>
                      {isThisPending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
                      ) : (
                        <Wallet className="w-4 h-4 text-emerald-400" />
                      )}
                    </button>
                  );
                })}

                {showSlowHint && (
                  <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-[11px] text-amber-200/90">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      La wallet no responde. Suele pasar cuando la extensión
                      está bloqueada o su ventana no llegó a abrirse: pincha en
                      el icono de la extensión en la barra del navegador,
                      desbloquéala y acepta la conexión pendiente — o vuelve a
                      pulsar el botón para reintentar.
                    </span>
                  </div>
                )}

                {connectorList.length === 0 && (
                  <div className="flex items-start gap-2 rounded-xl bg-neutral-900/70 border border-neutral-800 p-3 text-[11px] text-neutral-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      No se detectó ninguna extensión de wallet en este
                      navegador. Instala una (p. ej. Binance Wallet) o
                      habilita WalletConnect para usar tu wallet móvil (abajo).
                    </span>
                  </div>
                )}
              </div>

              {connectError && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 p-3 text-[11px] text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{humanConnectError(connectError)}</span>
                </div>
              )}

              <div className="rounded-xl bg-neutral-900/70 border border-neutral-800 p-3 text-[11px] text-neutral-400 leading-relaxed">
                <p className="font-semibold text-neutral-300 mb-1">
                  ¿Tu wallet es la app de Binance (u otra app móvil)?
                </p>
                <p>
                  En escritorio: instala la extensión{' '}
                  <span className="text-neutral-200">Binance Wallet</span> en el
                  navegador y aparecerá arriba. Desde el móvil: usa{' '}
                  <span className="text-neutral-200">WalletConnect</span> y
                  escanea el QR con la app de Binance (Perfil → WalletConnect).
                  {!connectors.some((c) => c.id === 'walletConnect') && (
                    <>
                      {' '}
                      Para habilitar WalletConnect, define{' '}
                      <span className="font-mono text-neutral-300">
                        VITE_WALLETCONNECT_PROJECT_ID
                      </span>{' '}
                      en .env.local (gratis en cloud.reown.com) y reinicia.
                    </>
                  )}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
