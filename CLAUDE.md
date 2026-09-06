# Aether Markets — guía para agentes

App de mercados de predicción con dinero real sobre dos venues: **Azuro**
(deportes, Polygon, USDT) y **Limitless** (no deportes, Base, USDC). React +
Vite + TypeScript estricto + wagmi/viem. Todo el código y los commits en
español.

## Comandos

- `npm run dev` — dev server (puerto 3000; hay `.claude/launch.json`).
- `npx vitest run` — tests (fixtures reales, sin red).
- `npx tsc --noEmit` — tipos. `api/` NO entra en el tsconfig: comprobar con
  `npx tsc --noEmit --ignoreConfig --strict --skipLibCheck --target es2022
  --module esnext --moduleResolution bundler --lib es2022 --types node api/<archivo>.ts`.

## Arquitectura en 30 segundos

- `src/domain/` — tipos y puerto `MarketSource`; la UI solo conoce esto.
- `src/adapters/<venue>/` — un adaptador por venue: `gateway.ts` (frontera de
  red/wallet, inyectable en tests), `validate.ts` (toda respuesta externa se
  valida como `unknown`), `mappers.ts`, `config.ts`.
- `src/services/marketSources.ts` — ÚNICO punto de composición de venues.
- `api/` — funciones serverless de Vercel, autocontenidas, desplegadas con
  cada push a `main` (produce en
  https://prediction-market-phi-rust.vercel.app).
- Vite exige `import.meta.env` LITERAL en el fuente (no aliasear).

## Depósito y gas: cómo apuesta alguien que solo tiene Binance

Documento completo (flujo de usuario, tabla de quién paga cada gas, runbook
de operación y checklist de prueba): **`docs/deposito-y-gasolinera.md`**.
Léelo antes de tocar nada de depósitos, approve, gas o la gasolinera.

Resumen para orientarse:

- El usuario retira USDT de Binance por **red Polygon** a su wallet local de
  la app (bóveda cifrada en localStorage; `src/services/localWallet.ts`).
  La pantalla guiada vive en `src/components/BinanceDepositGuide.tsx`
  (pestaña "Desde Binance" del depósito, con vigilancia del ingreso).
- **Apostar no requiere POL**: la apuesta va firmada EIP-712 al relayer de
  Azuro (tarifa en USDT), y el approve del USDT lo ejecuta la "gasolinera"
  (`api/gas-station.ts` + cliente `src/adapters/azuro/gasStation.ts`) como
  meta-transacción del UChildERC20, cobrando un peaje en USDT
  (`GAS_STATION_TOLL_USDT`, hoy 0.10). Sin gasolinera → fallback a approve
  on-chain ILIMITADO (una sola tx de gas por wallet).
- **Cobrar premios y retirar SÍ requieren POL** todavía (fase 3 pendiente:
  estudiar si `LP.withdrawPayout` puede llamarlo un tercero).

Reglas duras (dinero real):

- El dominio EIP-712 del USDT de Polygon se lee **on-chain** (`name()` +
  `ERC712_VERSION()`), JAMÁS hardcodear: Tether ya lo renombró una vez
  ("(PoS) Tether USD" → "USDT0").
- Claves privadas: nunca en código, .env del repo, chats ni logs. Las de
  servidor (`GAS_STATION_PRIVATE_KEY`) solo en Vercel, sin prefijo `VITE_`
  (todo `VITE_` acaba en el bundle público).
- La wallet de la gasolinera es una clave caliente asumida comprometible:
  nunca debe acumular más que ~20 POL + peajes.
- Nada de testnets: todas las pruebas son con dinero real e importes mínimos.

## Otras notas

- `resumen-del-proyecto.md` es documento de trabajo del usuario (excluido en
  `.git/info/exclude`): no confirmarlo ni borrarlo.
- Los tests de adaptadores usan fixtures reales recapturables
  (`scripts/dump-azuro-fixtures.mjs`).
- Commits directos a `main`; cada push despliega en Vercel.
