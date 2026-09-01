import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Copy,
  ExternalLink,
  Fuel,
  KeyRound,
  Loader2,
} from 'lucide-react';
import { erc20Abi, formatUnits, isAddress, parseUnits } from 'viem';
import { useBalance } from 'wagmi';
import {
  sendTransaction,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from 'wagmi/actions';
import { wagmiConfig } from '../config/wagmi';
import {
  BASE_CHAIN_ID,
  chainLabel,
  explorerTxUrl,
  POLYGON_CHAIN_ID,
} from '../config/chains';
import { localWalletVault } from '../services/localWallet';
import { venueTokens } from '../services/marketSources';
import { useVenueBalances } from '../hooks/useVenueBalances';
import { QrCodeCanvas } from './QrCodeCanvas';

interface LocalWalletActionsProps {
  address: `0x${string}`;
  /** Abre el bridge preseleccionado en el gas nativo de esa red. */
  onGetGas: (chainId: number) => void;
}

type ActionView = 'menu' | 'deposit' | 'withdraw' | 'backup';

/** Activo retirable: los tokens de apuesta más el gas nativo de cada red. */
interface WithdrawAsset {
  key: string;
  kind: 'erc20' | 'native';
  chainId: number;
  symbol: string;
  decimals: number;
  address?: `0x${string}`;
}

const NATIVE_ASSETS: WithdrawAsset[] = [
  { key: 'native-137', kind: 'native', chainId: POLYGON_CHAIN_ID, symbol: 'POL', decimals: 18 },
  { key: 'native-8453', kind: 'native', chainId: BASE_CHAIN_ID, symbol: 'ETH', decimals: 18 },
];

function humanWithdrawError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/insufficient funds|exceeds the balance|gas required/i.test(message)) {
    return 'Fondos insuficientes: revisa el importe y que haya gas nativo (POL en Polygon, ETH en Base) para pagar la transacción.';
  }
  if (/transfer amount exceeds balance/i.test(message)) {
    return 'El importe supera el saldo del token.';
  }
  // Los errores de viem traen párrafos de contexto; la primera línea basta.
  return message.split('\n')[0];
}

/**
 * Operativa de la wallet local una vez conectada: depositar (enseñar la
 * dirección con QR), retirar por cadena a cualquier dirección y respaldar la
 * clave privada. Solo se monta cuando el conector activo es el local.
 */
export const LocalWalletActions: React.FC<LocalWalletActionsProps> = ({
  address,
  onGetGas,
}) => {
  const [view, setView] = useState<ActionView>('menu');
  const [copied, setCopied] = useState(false);

  // Gas nativo de cada red, para avisar si falta antes de operar.
  const polBalance = useBalance({ address, chainId: POLYGON_CHAIN_ID });
  const ethBalance = useBalance({ address, chainId: BASE_CHAIN_ID });
  const { balances: tokenBalances, refetch: refetchTokens } = useVenueBalances();

  // Retiro
  const assets = useMemo<WithdrawAsset[]>(
    () => [
      ...venueTokens.map((t) => ({
        key: `erc20-${t.chainId}-${t.address}`,
        kind: 'erc20' as const,
        chainId: t.chainId,
        symbol: t.symbol,
        decimals: t.decimals,
        address: t.address,
      })),
      ...NATIVE_ASSETS,
    ],
    [],
  );
  const [assetKey, setAssetKey] = useState(assets[0]?.key ?? '');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  /** Paso de revisión: el envío es irreversible, así que nada de un clic. */
  const [reviewing, setReviewing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'confirming' | 'done'>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [txChainId, setTxChainId] = useState<number>(POLYGON_CHAIN_ID);
  const [error, setError] = useState<string | null>(null);

  // Respaldo
  const [backupPassword, setBackupPassword] = useState('');
  const [revealedKey, setRevealedKey] = useState<`0x${string}` | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const selectedAsset = assets.find((a) => a.key === assetKey) ?? assets[0];

  const assetBalance = (asset: WithdrawAsset): number | null => {
    if (asset.kind === 'native') {
      const data = asset.chainId === POLYGON_CHAIN_ID ? polBalance.data : ethBalance.data;
      return data ? Number(formatUnits(data.value, data.decimals)) : null;
    }
    return (
      tokenBalances.find((b) => b.chainId === asset.chainId && b.address === asset.address)
        ?.balance ?? null
    );
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  /** Valida el formulario; deja el error puesto y devuelve null si no pasa. */
  const validateWithdraw = (): bigint | null => {
    if (selectedAsset === undefined) return null;
    if (!isAddress(destination)) {
      setError('La dirección de destino no es válida.');
      return null;
    }
    let amountRaw: bigint;
    try {
      amountRaw = parseUnits(amount.replace(',', '.'), selectedAsset.decimals);
    } catch {
      setError('Importe inválido.');
      return null;
    }
    if (amountRaw <= 0n) {
      setError('El importe debe ser mayor que cero.');
      return null;
    }
    return amountRaw;
  };

  const handleReview = () => {
    setError(null);
    if (validateWithdraw() !== null) setReviewing(true);
  };

  const handleWithdraw = async () => {
    if (selectedAsset === undefined) return;
    const amountRaw = validateWithdraw();
    if (amountRaw === null) {
      setReviewing(false);
      return;
    }

    const chainId = selectedAsset.chainId as 137 | 8453;
    setError(null);
    setTxHash(null);
    setTxChainId(chainId);
    setStatus('sending');
    try {
      await switchChain(wagmiConfig, { chainId });
      const hash =
        selectedAsset.kind === 'erc20'
          ? await writeContract(wagmiConfig, {
              abi: erc20Abi,
              address: selectedAsset.address as `0x${string}`,
              functionName: 'transfer',
              args: [destination as `0x${string}`, amountRaw],
              chainId,
            })
          : await sendTransaction(wagmiConfig, {
              to: destination as `0x${string}`,
              value: amountRaw,
              chainId,
            });
      setTxHash(hash);
      setStatus('confirming');
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId });
      if (receipt.status !== 'success') {
        throw new Error('La transacción se revirtió en cadena.');
      }
      setStatus('done');
      setReviewing(false);
      setAmount('');
      refetchTokens();
      polBalance.refetch();
      ethBalance.refetch();
    } catch (e) {
      setStatus('idle');
      setError(humanWithdrawError(e));
    }
  };

  const handleReveal = async () => {
    setBackupBusy(true);
    setBackupError(null);
    try {
      setRevealedKey(await localWalletVault.revealPrivateKey(backupPassword));
      setBackupPassword('');
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : String(e));
    } finally {
      setBackupBusy(false);
    }
  };

  const backButton = (
    <button
      onClick={() => {
        setView('menu');
        setError(null);
        setStatus('idle');
        setTxHash(null);
        setReviewing(false);
        setRevealedKey(null);
        setBackupError(null);
        setBackupPassword('');
      }}
      className="self-start text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
    >
      ← Volver
    </button>
  );

  const gasRow = (
    <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
      <span>Gas · POL (Polygon)</span>
      <span className="text-neutral-200">
        {polBalance.data ? Number(formatUnits(polBalance.data.value, 18)).toFixed(4) : '—'}
      </span>
    </div>
  );
  const gasRowBase = (
    <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
      <span>Gas · ETH (Base)</span>
      <span className="text-neutral-200">
        {ethBalance.data ? Number(formatUnits(ethBalance.data.value, 18)).toFixed(5) : '—'}
      </span>
    </div>
  );

  return (
    <div className="rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20 p-3.5 flex flex-col gap-3">
      {view === 'menu' && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setView('deposit')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all active:scale-95"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Depositar · dirección y QR</span>
          </button>
          <button
            onClick={() => setView('withdraw')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/30 text-xs font-semibold text-neutral-200 transition-all active:scale-95"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-400" />
            <span>Retirar por cadena</span>
          </button>
          <button
            onClick={() => setView('backup')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-400 transition-all active:scale-95"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Respaldar clave privada</span>
          </button>
        </div>
      )}

      {view === 'deposit' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-center gap-2">
            <div className="p-2 rounded-xl bg-white">
              <QrCodeCanvas value={address} />
            </div>
            <div className="w-full rounded-lg bg-[#090b0f] border border-neutral-800 p-2.5 flex items-start gap-2">
              <span className="flex-1 text-[11px] font-mono text-neutral-200 break-all select-all">
                {address}
              </span>
              <button
                onClick={handleCopyAddress}
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

          <div className="rounded-lg bg-[#090b0f] border border-neutral-800 p-2.5 flex flex-col gap-1.5">
            {venueTokens.map((t) => (
              <div
                key={`${t.chainId}-${t.address}`}
                className="flex items-center justify-between text-[11px] font-mono text-neutral-400"
              >
                <span>
                  {t.symbol} · red {chainLabel(t.chainId)}
                </span>
                <span className="text-neutral-500">{t.displayName}</span>
              </div>
            ))}
            {gasRow}
            {gasRowBase}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-[11px] text-amber-200/90">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Envía cada token SOLO por su red (USDT por Polygon, USDC por
              Base); en otra red se pierde. Deposita también un poco de gas
              nativo (POL en Polygon, ETH en Base): hace falta para aprobar
              tokens y retirar premios. Con 1–2 € por red hay para meses.
            </span>
          </div>

          {/* Reponer gas sin salir de la app: bridge preseleccionado. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onGetGas(POLYGON_CHAIN_ID)}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/30 text-[11px] font-semibold text-neutral-300 transition-all active:scale-95"
            >
              <Fuel className="w-3 h-3 text-emerald-400" />
              <span>Conseguir POL</span>
            </button>
            <button
              onClick={() => onGetGas(BASE_CHAIN_ID)}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/30 text-[11px] font-semibold text-neutral-300 transition-all active:scale-95"
            >
              <Fuel className="w-3 h-3 text-emerald-400" />
              <span>Conseguir ETH</span>
            </button>
          </div>
          {backButton}
        </div>
      )}

      {view === 'withdraw' && reviewing && selectedAsset !== undefined && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold text-neutral-100">Revisa el retiro</p>
          <div className="rounded-lg bg-[#090b0f] border border-neutral-800 p-3 flex flex-col gap-2 text-[11px] font-mono">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Enviar</span>
              <span className="font-bold text-neutral-100 tabular-nums">
                {amount} {selectedAsset.symbol}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Red</span>
              <span className="text-neutral-200">{chainLabel(selectedAsset.chainId)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-neutral-500">Destino</span>
              {/* Principio y final resaltados: es lo que se coteja contra la
                  dirección buena, porque el timo típico las clona por ahí. */}
              <span className="break-all leading-relaxed">
                <span className="font-bold text-emerald-300">{destination.slice(0, 8)}</span>
                <span className="text-neutral-500">{destination.slice(8, -6)}</span>
                <span className="font-bold text-emerald-300">{destination.slice(-6)}</span>
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-[11px] text-amber-200/90">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Un envío en cadena no se puede deshacer. Coteja el principio y el
              final de la dirección con la de destino real.
            </span>
          </div>

          {error !== null && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setReviewing(false)}
              disabled={status === 'sending' || status === 'confirming'}
              className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-400 transition-all disabled:opacity-50"
            >
              Editar
            </button>
            <button
              onClick={handleWithdraw}
              disabled={status === 'sending' || status === 'confirming'}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all active:scale-95 disabled:opacity-50"
            >
              {(status === 'sending' || status === 'confirming') && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              <span>
                {status === 'sending'
                  ? 'Firmando y enviando…'
                  : status === 'confirming'
                    ? 'Esperando confirmación…'
                    : 'Confirmar y firmar'}
              </span>
            </button>
          </div>
        </div>
      )}

      {view === 'withdraw' && !reviewing && (
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
            Activo
          </label>
          <select
            value={assetKey}
            onChange={(e) => {
              setAssetKey(e.target.value);
              setError(null);
            }}
            className="w-full px-3 py-2 rounded-lg bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 outline-none text-sm text-neutral-100"
          >
            {assets.map((a) => (
              <option key={a.key} value={a.key}>
                {a.symbol} · {chainLabel(a.chainId)}
              </option>
            ))}
          </select>

          {selectedAsset !== undefined && (
            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
              <span>Disponible</span>
              <button
                onClick={() => {
                  const balance = assetBalance(selectedAsset);
                  if (balance !== null) setAmount(String(balance));
                }}
                title="Usar todo el saldo"
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {assetBalance(selectedAsset)?.toFixed(selectedAsset.kind === 'native' ? 5 : 2) ?? '—'}{' '}
                MAX
              </button>
            </div>
          )}

          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Importe"
            className="w-full px-3 py-2 rounded-lg bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 outline-none text-sm font-mono text-neutral-100 placeholder:text-neutral-600"
          />
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value.trim())}
            placeholder="Dirección de destino (0x…)"
            spellCheck={false}
            className="w-full px-3 py-2 rounded-lg bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 outline-none text-sm font-mono text-neutral-100 placeholder:text-neutral-600"
          />

          {selectedAsset?.kind === 'native' && (
            <p className="text-[11px] text-neutral-500">
              Al retirar todo el gas nativo, deja un pico para pagar esta misma
              transacción o fallará.
            </p>
          )}

          {error !== null && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {txHash !== null && (
            <div className="flex items-center justify-between rounded-lg bg-[#090b0f] border border-neutral-800 p-2.5 text-[11px] font-mono">
              <span className={status === 'done' ? 'text-emerald-400' : 'text-neutral-400'}>
                {status === 'done' ? 'Retiro confirmado' : 'Confirmando en cadena…'}
              </span>
              {explorerTxUrl(txChainId, txHash) !== null && (
                <a
                  href={explorerTxUrl(txChainId, txHash) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
                >
                  <span>ver tx</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          <button
            onClick={handleReview}
            disabled={amount === '' || destination === ''}
            className="w-full py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all active:scale-95 disabled:opacity-50"
          >
            Revisar retiro
          </button>
          {backButton}
        </div>
      )}

      {view === 'backup' && (
        <div className="flex flex-col gap-2">
          {revealedKey === null ? (
            <>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Introduce la contraseña para descifrar y ver la clave privada.
                Guárdala en un sitio seguro: es la única recuperación posible.
              </p>
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Contraseña"
                autoComplete="current-password"
                className="w-full px-3 py-2 rounded-lg bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 outline-none text-sm text-neutral-100 placeholder:text-neutral-600"
              />
              {backupError !== null && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{backupError}</span>
                </div>
              )}
              <button
                onClick={handleReveal}
                disabled={backupBusy || backupPassword === ''}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all disabled:opacity-50"
              >
                {backupBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Mostrar clave privada</span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-[11px] text-amber-200/90">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>No compartas esta clave con nadie ni la pegues en webs.</span>
              </div>
              <div className="rounded-lg bg-[#090b0f] border border-neutral-800 p-2.5 flex items-start gap-2">
                <span className="flex-1 text-[11px] font-mono text-neutral-200 break-all select-all">
                  {revealedKey}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(revealedKey);
                    setKeyCopied(true);
                    window.setTimeout(() => setKeyCopied(false), 2000);
                  }}
                  title="Copiar clave privada"
                  className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 transition-colors"
                >
                  {keyCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </>
          )}
          {backButton}
        </div>
      )}
    </div>
  );
};
