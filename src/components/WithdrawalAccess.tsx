import { useRef, useState } from 'react';
import { formatUnits, isAddress, parseUnits } from 'viem';
import { Coins } from 'lucide-react';
import { balanceWithdrawal } from '../services/marketSources';
import { useVenueBalances } from '../hooks/useVenueBalances';
import { useWallet } from '../services/web3Service';
import type { WithdrawalProgress, WithdrawalReceipt } from '../domain/withdrawal';

interface WithdrawalAccessProps { open: boolean; onToggle: () => void }

export function WithdrawalAccess({ open, onToggle }: WithdrawalAccessProps) {
  const wallet = useWallet();
  const { balances, isLoading, refetch } = useVenueBalances();
  const [venue, setVenue] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [progress, setProgress] = useState<WithdrawalProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WithdrawalReceipt | null>(null);
  const busyRef = useRef(false);
  const token = balances.find(t => t.venue === venue) ?? balances[0];
  const pending = wallet.address && token ? balanceWithdrawal.pending(token.venue, wallet.address) : null;
  const destination = pending?.recipient ?? recipient.trim();
  const requestedAmount = pending?.amount ?? amount.trim();
  let validAmount = false;
  if (token && new RegExp(`^\\d+(?:\\.\\d{1,${token.decimals}})?$`).test(requestedAmount)) {
    const raw = parseUnits(requestedAmount, token.decimals);
    validAmount = raw > 0n && (pending !== null || token.rawBalance !== null && raw <= token.rawBalance);
  }
  const validRecipient = isAddress(destination) && !/^0x0{40}$/i.test(destination)
    && destination.toLowerCase() !== wallet.address?.toLowerCase();
  const busy = progress !== null;
  const execute = async () => {
    if (!wallet.address || !token || !validAmount || !validRecipient || busyRef.current) return;
    busyRef.current = true;
    setError(null); setReceipt(null); setProgress({ status: 'pending' });
    try {
      const result = await balanceWithdrawal.withdraw({ venue: token.venue, from: wallet.address,
        recipient: destination, amount: requestedAmount }, setProgress);
      if (result.ok) { setReceipt(result.data); setAmount(''); refetch(); }
      else setError(result.error.message);
    } finally { setProgress(null); busyRef.current = false; }
  };
  return (
    <section className="flex flex-col gap-3" aria-label="Retirar fondos">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls="withdrawal-destination"
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black hover:bg-emerald-400">
        <Coins className="h-4 w-4" />Retirar fondos a mi wallet
      </button>
      {open && <div id="withdrawal-destination" className="flex flex-col gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
        <label className="text-xs text-neutral-200">Token y red
          <select aria-label="Token y red" value={token?.venue ?? ''} onChange={e => setVenue(e.target.value)} disabled={busy}
            className="mt-1 w-full rounded-lg bg-neutral-950 p-2">
            {balances.map(t => <option key={t.venue} value={t.venue}>{t.symbol} · {t.chainId === 137 ? 'Polygon' : t.chainId === 8453 ? 'Base' : t.chainId}</option>)}
          </select>
        </label>
        <p role="status" className="text-xs text-neutral-300">{!wallet.address ? 'Conecta tu wallet para retirar fondos.' : isLoading ? 'Consultando saldo…'
          : token?.rawBalance === null || !token ? 'Saldo no disponible. Recarga para consultar.' : `Saldo disponible: ${formatUnits(token.rawBalance, token.decimals)} ${token.symbol}`}</p>
        <label className="text-xs text-neutral-200">Dirección de destino
          <input value={destination} onChange={e => setRecipient(e.target.value)} disabled={busy || pending !== null} placeholder="0x…" spellCheck={false} autoComplete="off"
            className="mt-1 w-full rounded-lg bg-neutral-950 p-2 font-mono text-xs" />
        </label>
        {destination && !validRecipient && <p className="text-xs text-rose-300">Ingresa una dirección EVM válida, distinta de cero y de tu wallet activa.</p>}
        <label className="text-xs text-neutral-200">Monto a retirar
          <input value={requestedAmount} onChange={e => setAmount(e.target.value)} disabled={busy || pending !== null} inputMode="decimal" placeholder="5.00"
            className="mt-1 w-full rounded-lg bg-neutral-950 p-2 text-xs" />
        </label>
        {requestedAmount && !validAmount && <p className="text-xs text-rose-300">Comprueba el saldo y los decimales del importe.</p>}
        <p className="text-[11px] text-neutral-400">El envío sale de tu wallet activa. La dirección de destino debe recibir {token?.symbol} en la misma red. Confirmarás una transferencia en tu wallet.</p>
        {pending && <p className="text-xs text-amber-300">Hay un retiro pendiente. Se comprobará la transacción existente antes de permitir otro envío.</p>}
        <button type="button" onClick={() => void execute()} disabled={!wallet.address || !validAmount || !validRecipient || busy}
          className="rounded-lg bg-emerald-500 p-2 text-xs font-bold text-black disabled:opacity-50">
          {busy ? progress?.status === 'confirming' ? 'Confirmando en la red…' : 'Confirma en tu wallet…' : pending ? 'Comprobar retiro pendiente' : 'Confirmar retiro'}
        </button>
        {progress?.hash && <p className="break-all text-xs text-neutral-400">Transacción: {progress.hash}</p>}
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        {receipt && <p role="status" className="text-xs text-emerald-300">Retiro confirmado. {receipt.explorerUrl && <a href={receipt.explorerUrl} target="_blank" rel="noopener noreferrer" className="underline">Ver transacción</a>}</p>}
        <button type="button" onClick={() => refetch()} className="text-xs text-neutral-400 underline">Recargar saldo</button>
      </div>}
    </section>
  );
}
