# Depósito desde Binance y la gasolinera de gas

Cómo un usuario que solo tiene Binance deposita y apuesta en la app **sin
saber qué es el gas**, y cómo se opera la infraestructura que lo hace posible.
Todo con dinero real: aquí no hay testnets.

## La idea en una frase

El usuario retira USDT de Binance a su wallet de la app (red Polygon), y todo
lo que normalmente exigiría tener POL para gas — la autorización del token y
la propia apuesta — viaja **firmado** y lo ejecuta otro pagando el gas: el
relayer de Azuro (la apuesta) y nuestra "gasolinera" (la autorización, que
cobra un peaje pequeño en USDT).

## Flujo del usuario (la guía que verá tu amigo)

1. **Crear wallet**: abrir la app → Conectar wallet → Crear wallet → elegir
   contraseña → guardar la clave de respaldo.
2. **Depositar**: en la app, pantalla de depósito → aparece un QR con la
   dirección. En Binance: Retirar → USDT → **red Polygon** (¡nunca ERC20 ni
   BEP20: elegir mal la red pierde el dinero!) → escanear el QR → enviar
   (mínimo de Binance: ~10 USDT; comisión de céntimos).
3. **Apostar**: elegir partido, importe y confirmar. En la primera apuesta la
   app pide dos firmas extra (peaje de 0,10 USDT + autorización); son
   instantáneas y gratuitas en gas. Desde entonces, una firma por apuesta.

El usuario **nunca necesita POL**. Lo único que hoy sigue exigiendo gas es
cobrar premios y retirar fondos (ver "Límites actuales").

## Cómo funciona por debajo

| Operación | Quién paga el gas | Cómo |
|---|---|---|
| Apuesta (simple/combinada) | Relayer de **Azuro** | Firma EIP-712 → `POST /bet/orders/*`; tarifa (`relayerFeeAmount`) cobrada en USDT |
| Cash out (venta anticipada) | Relayer de **Azuro** | Firma EIP-712 → `/cashout/create` |
| Approve del USDT al relayer | **Nuestra gasolinera** | Meta-transacciones del UChildERC20 (abajo) |
| Approve (plan B, sin gasolinera) | El usuario | `approve` on-chain **ilimitado**: una única tx de gas por wallet |
| Cobro de premios (`LP.withdrawPayout`) | El usuario | On-chain; pendiente fase 3 |

### La gasolinera (`api/gas-station.ts`)

El USDT de Polygon (`0xc2132D05D31c914a87C6611C10748AEb04B58e8F`) es un
UChildERC20 con **meta-transacciones nativas**: `executeMetaTransaction`
ejecuta cualquier función del token firmada EIP-712 por el usuario, pagando
el gas quien la envía.

El cliente (`src/adapters/azuro/gasStation.ts`) firma dos operaciones con
nonces consecutivos y las manda a `POST /api/gas-station`:

1. `transfer(gasolinera, peaje)` — el usuario paga el servicio EN USDT.
2. `approve(relayer de Azuro, ilimitado)` — lo que necesita para apostar.

El servidor **solo** acepta ese patrón exacto (cualquier otra función,
destinatario o importe → 400), verifica las firmas antes de gastar gas,
ejecuta el peaje primero y confirma ambas transacciones antes de responder.
Si algo falla, el cliente cae al approve on-chain clásico sin romper nada.

El dominio EIP-712 del token se lee **on-chain en cada uso** (`name()` +
`ERC712_VERSION()`): Tether ya renombró el token una vez («(PoS) Tether USD»
→ «USDT0», 2025) y un valor fijado en código se rompería en la siguiente.

## Operación de la gasolinera (runbook)

- **Dirección**: `0x12511B1E7A22FFFD2fbccBd6C86b5aB689464883` (Polygon).
- **Estado**: `GET https://prediction-market-phi-rust.vercel.app/api/gas-station`
  → `{enabled, station, tollAmount, ...}`. Si `enabled:false`, falta la clave
  en Vercel o hay que redesplegar.
- **Combustible**: mantenerla con **~20 POL**. Por debajo de 0,05 POL el
  endpoint rechaza el servicio (503 «se quedó sin POL») y la app cae al plan
  B. Rellenar desde Binance: Retirar → POL → red Polygon → esa dirección.
- **Peajes**: se acumulan en USDT en esa misma wallet. Si juntan más de unos
  pocos euros, barrerlos a la wallet principal.
- **Variables (Vercel, SIN prefijo VITE_)**:
  - `GAS_STATION_PRIVATE_KEY` — clave de la wallet. Cambiarla:
    `npx vercel env rm GAS_STATION_PRIVATE_KEY production -y` →
    `npx vercel env add GAS_STATION_PRIVATE_KEY production` → redesplegar
    (`npx vercel redeploy prediction-market-phi-rust.vercel.app`).
  - `GAS_STATION_TOLL_USDT` — peaje (hoy `0.10`; `0` lo desactiva).
  - `GAS_STATION_RPC_URL` — opcional; por defecto publicnode.
- **Seguridad**: es una **clave caliente** y se asume comprometible; por eso
  jamás guarda más que el combustible y los peajes. La clave privada no se
  pega en ningún sitio salvo el prompt de `vercel env add` (ni chats, ni
  notas compartidas: dirección de 42 caracteres = pública; clave de 66 =
  secreta). Presupuesto máximo en juego si algo sale mal: unos pocos euros.

## Costes reales (Polygon, 2026)

| Concepto | Cuánto | Quién lo paga |
|---|---|---|
| Retiro USDT desde Binance | ~0,3-1 USDT, mínimo ~10 | El usuario |
| Peaje de la gasolinera (una vez por wallet) | 0,10 USDT | El usuario |
| Gas de las 2 meta-tx | fracciones de céntimo | La gasolinera (cubierto por el peaje) |
| Tarifa del relayer de Azuro | según `bet/gas-info`, en USDT | El usuario, dentro de la apuesta |
| Fondo de la gasolinera | ~20 POL ≈ 4-5 € (miles de operaciones) | El anfitrión, una vez |

## Límites actuales

- **Cobrar premios** (`LP.withdrawPayout`) y **retirar fondos** de la wallet
  siguen necesitando POL del usuario. Fase 3 pendiente: averiguar si
  `withdrawPayout` puede llamarla un tercero (la gasolinera) con el premio
  yendo al dueño de la apuesta.
- La gasolinera es **solo Polygon/USDT/Azuro**. Limitless (Base) queda fuera
  del plan de pruebas con amigos.
- En dev local (`npm run dev`) el endpoint no existe: la app cae al approve
  on-chain sin error. Se prueba de verdad solo en el deploy de Vercel.

## Checklist de la prueba pendiente (cuando haya fondos)

1. Enviar ~20 POL a la gasolinera (`0x12511B...464883`).
2. Crear una wallet limpia en la app (incógnito) — sin POL, jamás.
3. Depositarle 5-10 USDT desde Binance (red Polygon).
4. Apostar ~1 USDT a un partido: deben verse 3 firmas (peaje + approve +
   apuesta), cero transacciones de la wallet del usuario, y en Polygonscan
   las dos meta-tx pagadas por la gasolinera.
5. Comprobar que el peaje (0,10 USDT) llegó a la gasolinera.
6. Segunda apuesta: una sola firma (la allowance ilimitada ya está).
