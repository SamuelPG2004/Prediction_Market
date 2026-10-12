# Arquitectura

Aether Markets es un terminal de mercados de predicción **reales** construido
con una arquitectura de **puertos y adaptadores**. La UI no conoce ningún
protocolo concreto: consume un dominio propio, y cada venue se conecta detrás
de un adaptador intercambiable.

```
┌────────────────────── UI (React) ──────────────────────┐
│  MarketsView · EventCard · TradePanel · PositionsDrawer │
│  hooks: useDomainEvents · useVenueBalances              │
└───────────────────────────┬─────────────────────────────┘
                            │ solo tipos del dominio
┌───────────────────────────▼─────────────────────────────┐
│                      src/domain/                         │
│  types.ts  → Market, Quote, BetReceipt, Position,        │
│              Result<T>, VenueError, MarketSource (puerto)│
│  registry.ts → colección de MarketSource activos         │
└───────────────────────────┬─────────────────────────────┘
                            │ implementan el puerto
        ┌───────────────────┴────────────────────┐
┌───────▼─────────┐                     ┌─────────▼────────┐
│ adapters/azuro  │                     │ adapters/limitless│
│ deportes        │                     │ no deportes       │
│ Polygon · USDT  │                     │ Base · USDC       │
│ vAMM + relayer  │                     │ order book (CLOB) │
└─────────────────┘                     └───────────────────┘
```

## Reglas no negociables

1. **Ningún componente de UI importa un tipo, campo o endpoint de un venue.**
   El único archivo fuera de `src/adapters/` que importa adaptadores es el
   punto de composición `src/services/marketSources.ts`.
2. **Añadir un venue = un adaptador nuevo + una línea en la composición.**
   Cero cambios en la UI.
3. **Toda respuesta externa se valida como `unknown` antes de mapear**
   (`validate.ts` de cada adaptador). Los tipos de un SDK son de compilación,
   no una garantía: ambas APIs reales se desvían de su propia documentación.
4. **Errores como resultados tipados** (`Result<T>` con `VenueError`), nunca
   excepciones hacia la UI.
5. **Sin cotización ⇒ `probability: null`**, jamás 0%. Un mercado resuelto
   llega con precios degenerados y no debe renderizarse como operable.

## El puerto: `MarketSource`

Cada venue declara sus capacidades (`canPlaceBet`, `canReadPositions`…) y
expone: `listMarkets` (con filtro y cursor opaco), `getMarket`, `getQuote`
(cotización EJECUTABLE, no un punto medio), `placeBet` y `getPositions`.

`Quote.venueData` es un payload opaco del venue: transporta lo necesario para
ejecutar sin recotizar (cuota firmada en Azuro, precio límite y tokenId en
Limitless). Solo el adaptador que lo creó lo interpreta.

## Los adaptadores

### Azuro (`src/adapters/azuro/`) — deportes, Polygon, USDT

- Datos por el Backend API oficial vía `@azuro-org/toolkit` (framework-agnóstico).
- Un `Market` = una condición; el partido es `Market.group`.
- Apostar: tarifa del relayer → allowance USDT→relayer → firma EIP-712
  (`getBetTypedData`) → orden al relayer. `minOdds` = cuota ± slippage,
  escalada a 12 decimales.
- Exige `VITE_AZURO_AFFILIATE_ADDRESS` para apostar (si falta,
  `canPlaceBet: false`).

### Limitless (`src/adapters/limitless/`) — no deportes, Base, USDC

- REST + viem, sin SDK (el oficial arrastra ethers 6/axios/socket.io).
- Mercados CLOB simples y grupos negRisk (cursor compuesto `clob:N` → `group:N`).
  Los AMM heredados se descartan al mapear. Deportes excluidos por defecto
  (los sirve Azuro); configurable con `VITE_LIMITLESS_INCLUDE_SPORTS`.
- `getQuote` recorre el order book real (comprar NO = 1 − bids de YES) con
  aritmética entera; devuelve impacto en precio y rechaza sin liquidez.
- Apostar: orden **FAK** con precio límite (peor precio + slippage), firmada
  EIP-712 contra `venue.exchange`, enviada con autenticación HMAC del token
  API (`VITE_LIMITLESS_API_TOKEN_ID/SECRET`; sin ellas, `canPlaceBet: false`).
- **CORS**: la API solo permite sus propios orígenes. El navegador pasa por el
  proxy same-origin `/api/limitless` (vite.config.ts en dev/preview; en
  producción hace falta un reverse proxy equivalente). La firma HMAC firma la
  ruta real, así que el prefijo del proxy no la afecta.

## Composición y wallet

`src/services/marketSources.ts` construye los adaptadores con **puentes de
wallet perezosos**: resuelven los clientes viem de wagmi al operar (cambiando
de cadena si toca), porque al arrancar no hay wallet. wagmi es multi-chain
(Polygon + Base) con transportes de fallback; los RPCs viven en
`src/config/chains.ts` (los públicos caducan — hay lista verificada y
`VITE_POLYGON_RPC_URL`/`VITE_BASE_RPC_URL` para endpoints propios).

## Cobro de premios y retiro de saldo

El saldo disponible es el balance ERC-20 real de la wallet activa. Cobrar una
posición con `redeemPosition` únicamente acredita esa wallet; nunca envía a
un destino externo. Ganar marca el premio como cobrable: el saldo aumenta
cuando la transacción de cobro se confirma, sin contabilidad ficticia local.

`WithdrawalPort` es independiente de tickets. Su adaptador comprueba el saldo
real y envía un importe explícito a la dirección elegida mediante ERC-20.
La composición usa los tokens ya configurados y el puente de wallet existente.
Los importes se procesan con bigint y los decimales del token. La UI presenta
saldo, red, importe, destino, firma, confirmación y resultado.

El registro local versionado guarda intentos y hashes pendientes. Un hash
existente se comprueba sin repetir el envío, incluso tras recargar. Solo un
recibo revertido libera el intento para una nueva transferencia. Un intento
sin hash después de una interrupción se bloquea para revisión en la wallet.
El almacenamiento debe estar disponible antes de iniciar una firma.

Los recibos antiguos de `usePayoutReceipts` y su `transferPayout` se conservan
para recuperar exclusivamente envíos anteriores de premios, sin repetir el
cobro. Todas las transacciones requieren una acción explícita del usuario.

## Presentación del sportsbook

La portada abre en Deportes. `SportsMarketPreview` organiza los mercados del
evento por categoría y línea, y cada cuota conserva su marketId/outcomeId.
`MarketOdds` comparte el render de precios y selecciones entre tarjetas y lista.
`sportsMarkets` clasifica etiquetas del dominio: no importa adaptadores ni SDKs.

El ganador reconoce también Match Result y tiempo reglamentario. Si no hay
cotización en ese mercado, se presenta otra opción disponible con su etiqueta
real; si no hay ninguna, se indica la falta de cuotas. Nunca se inventan precios.
El detalle permite buscar mercados y escoger resultados de goles, hándicaps,
córneres, tarjetas y periodos. Seleccionar una cuota solo modifica el boleto;
apostar sigue requiriendo una acción explícita y la ruta de ejecución existente.

## Tests

`npm test` — vitest, sin red. Cada adaptador se prueba contra fixtures
REALES capturados de las APIs (`scripts/dump-*-fixtures.mjs`), con una
pasarela falsa inyectada. Cubren: mercado sin cotización, mercado
cerrado/resuelto, respuesta malformada, flujo completo de apuesta y
clasificación de errores.

## Historial

El proyecto empezó como mercado de práctica con datos de Polymarket. El modo
práctica se eliminó en la Fase 4 (PRs #1–#4 documentan la migración por fases).
Los hallazgos técnicos de las APIs viven en los comentarios de cada adaptador y
en los README de fixtures.
