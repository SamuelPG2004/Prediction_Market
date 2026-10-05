import { isAddress } from 'viem';
import { Coins } from 'lucide-react';

interface WithdrawalAccessProps {
  open: boolean;
  connected: boolean;
  loading: boolean;
  readError: boolean;
  availableCount: number;
  recipient: string;
  onToggle: () => void;
  onRecipientChange: (recipient: string) => void;
}

/** Acceso visible incluso cuando aún no existe un ticket cobrable. */
export function WithdrawalAccess({ open, connected, loading, readError, availableCount,
  recipient, onToggle, onRecipientChange }: WithdrawalAccessProps) {
  const validRecipient = isAddress(recipient.trim()) && !/^0x0{40}$/i.test(recipient.trim());
  return (
    <section className="flex flex-col gap-3" aria-label="Retiro a wallet">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls="withdrawal-destination"
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black hover:bg-emerald-400">
        <Coins className="h-4 w-4" />Retirar a mi wallet
      </button>
      {open && (
        <div id="withdrawal-destination" className="flex flex-col gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <label className="text-xs text-neutral-200">
            Dirección de destino
            <input value={recipient} onChange={event => onRecipientChange(event.target.value)}
              placeholder="0x…" spellCheck={false} autoComplete="off"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-2 font-mono text-xs" />
          </label>
          {recipient.trim() !== '' && !validRecipient && <p className="text-[11px] text-rose-300">Ingresa una dirección EVM válida y distinta de cero.</p>}
          <p role="status" className="text-[11px] leading-relaxed text-neutral-300">
            {!connected ? 'Conecta tu wallet para consultar los premios que puedes retirar.'
              : loading ? 'Consultando premios disponibles…'
              : readError ? 'No pudimos consultar todos tus tickets. Pulsa Recargar; abajo verás el detalle.'
              : availableCount === 0 ? 'Todavía no hay premios disponibles para retirar. Las apuestas abiertas deben resolverse y quedar cobrables.'
              : `Tienes ${availableCount} ${availableCount === 1 ? 'premio disponible' : 'premios disponibles'}. Selecciona un ticket abajo para confirmar el retiro.`}
          </p>
          <p className="text-[10px] leading-relaxed text-neutral-500">El destino debe recibir el token en la misma red del premio. Si eliges otra dirección, confirmarás el cobro y después el envío ERC-20 en tu wallet.</p>
          <button type="button" onClick={onToggle} className="self-start text-[11px] text-neutral-400 underline hover:text-white">Volver a mis apuestas</button>
        </div>
      )}
    </section>
  );
}
