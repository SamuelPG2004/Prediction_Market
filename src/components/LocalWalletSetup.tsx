import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { localWalletVault, MIN_PASSWORD_LENGTH } from '../services/localWallet';
import { shortenAddress } from '../utils/formatters';

interface LocalWalletSetupProps {
  /** Conecta el conector local en wagmi; la bóveda ya queda desbloqueada. */
  onConnect: () => void;
  isConnecting: boolean;
}

type SetupView = 'menu' | 'create' | 'import' | 'backup' | 'delete';

/**
 * Alta y desbloqueo de la wallet local de la app: crear una nueva, importar
 * una clave existente o desbloquear la guardada. Vive en el modal de wallet,
 * por encima de la lista de wallets externas.
 */
export const LocalWalletSetup: React.FC<LocalWalletSetupProps> = ({
  onConnect,
  isConnecting,
}) => {
  const [view, setView] = useState<SetupView>('menu');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [importedKey, setImportedKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Clave recién creada, visible UNA vez para respaldarla. */
  const [freshKey, setFreshKey] = useState<`0x${string}` | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  const hasWallet = localWalletVault.hasStoredWallet();
  const storedAddress = localWalletVault.storedAddress();

  const resetForms = (next: SetupView) => {
    setPassword('');
    setPasswordRepeat('');
    setImportedKey('');
    setError(null);
    setView(next);
  };

  const validatePasswords = (): boolean => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return false;
    }
    if (password !== passwordRepeat) {
      setError('Las contraseñas no coinciden.');
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validatePasswords()) return;
    setBusy(true);
    setError(null);
    try {
      const { privateKey } = await localWalletVault.create(password);
      setFreshKey(privateKey);
      setBackupConfirmed(false);
      setView('backup');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!validatePasswords()) return;
    setBusy(true);
    setError(null);
    try {
      await localWalletVault.importKey(importedKey, password);
      onConnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await localWalletVault.unlock(password);
      onConnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyKey = () => {
    if (freshKey === null) return;
    navigator.clipboard.writeText(freshKey);
    setKeyCopied(true);
    window.setTimeout(() => setKeyCopied(false), 2000);
  };

  const passwordInput = (
    placeholder: string,
    value: string,
    onChange: (v: string) => void,
    autoComplete: string,
  ) => (
    <input
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className="w-full px-3 py-2 rounded-lg bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 outline-none text-sm text-neutral-100 placeholder:text-neutral-600"
    />
  );

  const errorBox = error !== null && (
    <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );

  return (
    <div className="rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20 p-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <div>
          <p className="text-xs font-bold text-neutral-100">Wallet de la app</p>
          <p className="text-[11px] text-neutral-400">
            Deposita por cadena y apuesta sin extensión ni app externa
          </p>
        </div>
      </div>

      {view === 'menu' && !hasWallet && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => resetForms('create')}
            className="w-full py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all active:scale-95"
          >
            Crear wallet nueva
          </button>
          <button
            onClick={() => resetForms('import')}
            className="w-full py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-300 transition-all active:scale-95"
          >
            Importar clave privada
          </button>
        </div>
      )}

      {view === 'menu' && hasWallet && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
            <Lock className="w-3 h-3 text-neutral-500" />
            <span>{storedAddress !== null ? shortenAddress(storedAddress, 6) : '—'}</span>
            <span className="text-neutral-600">· bloqueada</span>
          </div>
          {localWalletVault.isUnlocked() ? (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="w-full py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all active:scale-95 disabled:opacity-50"
            >
              Conectar
            </button>
          ) : (
            <>
              {passwordInput('Contraseña', password, setPassword, 'current-password')}
              <button
                onClick={handleUnlock}
                disabled={busy || isConnecting || password === ''}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all active:scale-95 disabled:opacity-50"
              >
                {busy || isConnecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <KeyRound className="w-3.5 h-3.5" />
                )}
                <span>Desbloquear y conectar</span>
              </button>
            </>
          )}
          {errorBox}
          <button
            onClick={() => resetForms('delete')}
            className="self-start text-[11px] text-neutral-500 hover:text-rose-400 transition-colors"
          >
            ¿Olvidaste la contraseña? Borrar wallet guardada…
          </button>
        </div>
      )}

      {view === 'create' && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            La clave se genera aquí y se guarda cifrada con esta contraseña en
            este navegador. Después podrás depositar enviando fondos a su
            dirección.
          </p>
          {passwordInput('Contraseña (mín. 8 caracteres)', password, setPassword, 'new-password')}
          {passwordInput('Repite la contraseña', passwordRepeat, setPasswordRepeat, 'new-password')}
          {errorBox}
          <div className="flex gap-2">
            <button
              onClick={() => resetForms('menu')}
              className="flex-1 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-400 transition-all"
            >
              Volver
            </button>
            <button
              onClick={handleCreate}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all disabled:opacity-50"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Crear y cifrar</span>
            </button>
          </div>
        </div>
      )}

      {view === 'import' && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            Pega la clave privada (0x + 64 hexadecimales) de una wallet que ya
            tengas. Se guarda cifrada con la contraseña; la app firmará con
            ella.
          </p>
          <input
            type="password"
            value={importedKey}
            onChange={(e) => setImportedKey(e.target.value)}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-2 rounded-lg bg-[#090b0f] border border-neutral-800 focus:border-emerald-500/50 outline-none text-sm font-mono text-neutral-100 placeholder:text-neutral-600"
          />
          {passwordInput('Contraseña (mín. 8 caracteres)', password, setPassword, 'new-password')}
          {passwordInput('Repite la contraseña', passwordRepeat, setPasswordRepeat, 'new-password')}
          {errorBox}
          <div className="flex gap-2">
            <button
              onClick={() => resetForms('menu')}
              className="flex-1 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-400 transition-all"
            >
              Volver
            </button>
            <button
              onClick={handleImport}
              disabled={busy || isConnecting}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all disabled:opacity-50"
            >
              {(busy || isConnecting) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Importar y conectar</span>
            </button>
          </div>
        </div>
      )}

      {view === 'backup' && freshKey !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-[11px] text-amber-200/90">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Guarda esta clave privada en un sitio seguro (gestor de
              contraseñas, papel). Es la ÚNICA forma de recuperar los fondos si
              pierdes este navegador o la contraseña.
            </span>
          </div>
          <div className="rounded-lg bg-[#090b0f] border border-neutral-800 p-2.5 flex items-start gap-2">
            <span className="flex-1 text-[11px] font-mono text-neutral-200 break-all select-all">
              {freshKey}
            </span>
            <button
              onClick={handleCopyKey}
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
          <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={backupConfirmed}
              onChange={(e) => setBackupConfirmed(e.target.checked)}
              className="accent-emerald-500"
            />
            He guardado la clave en un lugar seguro
          </label>
          <button
            onClick={() => {
              setFreshKey(null);
              onConnect();
            }}
            disabled={!backupConfirmed || isConnecting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold text-emerald-300 transition-all disabled:opacity-40"
          >
            {isConnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Conectar wallet</span>
          </button>
        </div>
      )}

      {view === 'delete' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2.5 text-[11px] text-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Borrar la wallet elimina la clave cifrada de este navegador. Si
              tiene fondos y no respaldaste la clave privada, se pierden PARA
              SIEMPRE. Esto no se puede deshacer.
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => resetForms('menu')}
              className="flex-1 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-400 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                localWalletVault.remove();
                resetForms('menu');
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-bold text-rose-400 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Borrar definitivamente</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
