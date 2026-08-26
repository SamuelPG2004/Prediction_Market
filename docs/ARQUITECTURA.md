# Arquitectura

## Idea central

Un mercado de predicciones personal. El ciclo completo es:

```
crear mercado → apostar → (vender) → resolver → cobrar
```

Todo ocurre en el navegador. No hay servidor, ni base de datos, ni blockchain
en el camino crítico.

## Estructura

```
src/
├── store/persistence.ts      Lectura/escritura en localStorage, validada
├── hooks/useMarketStore.ts   Estado central + todas las acciones
├── services/web3Service.ts   Wallet: identidad y lectura de saldo (opcional)
├── config/wagmi.ts           Configuración de wagmi para Polygon
├── providers/Web3Provider.tsx
├── data/mockMarkets.ts       Mercados de ejemplo iniciales
├── components/               UI
├── utils/formatters.ts       Formato y matemática de shares
├── types.ts                  Modelo de dominio
└── App.tsx
```

El estado vive en un único hook, `useMarketStore`. Los componentes son
presentacionales y reciben todo por props.

## Persistencia

Una sola clave en `localStorage`: `aether-markets/v1`, con `version`, mercados,
posiciones, movimientos, saldo y los IDs de mercados privados desbloqueados.

La lectura valida la forma del objeto antes de aceptarlo (`isPersistedState`).
Si está corrupto o es de otra versión, se ignora y se arranca de cero en lugar
de romper la app. La escritura va envuelta en `try/catch`: en modo privado o con
la cuota llena, la app sigue funcionando en memoria.

El campo `version` existe para poder migrar más adelante sin perder datos.

## Modelo de precios

Cada mercado tiene una probabilidad SÍ entre 2% y 98%. El precio de una share
es la probabilidad dividida entre 100, así que **los precios de SÍ y NO siempre
suman exactamente $1,00**.

Al comprar, el precio se mueve según la presión de la orden:

```
presión = monto / (profundidad + monto)
desplazamiento = presión × 100 puntos
```

Una orden de $200 en un mercado de profundidad $500 mueve la probabilidad de 50%
a 78,6%. La misma orden en un mercado de profundidad $5.000.000 no la mueve de
forma perceptible. La `profundidad inicial` que eliges al crear un mercado es
justo esta calibración.

Esto es una **simplificación deliberada**, no un AMM real. No es LMSR ni un
libro de órdenes. Dos consecuencias que conviene tener presentes:

- La orden se llena al precio *previo* al impacto: no hay slippage aplicado al
  fill, como si fuera una orden límite al precio vigente.
- La profundidad crece con el volumen (`+ monto × 0,5`), así que un mercado muy
  operado se vuelve progresivamente más difícil de mover.

## Resolución

Resolver es la operación que hace que el mercado sea tuyo, y la que ningún
protocolo externo te permitiría: declaras el resultado y se liquida.

- Las shares del resultado ganador pagan $1 cada una, al saldo.
- Las del perdedor pagan $0.
- Las posiciones del mercado se cierran y queda un movimiento `CLAIM_REWARD`
  por cada una, incluidas las que no cobraron, para que el historial sea
  completo.
- El mercado queda en `resolved` y no acepta más órdenes.

Es irreversible por diseño, y la UI pide confirmación en dos pasos.

## Wallet en modo práctica

En **modo práctica** conectar una wallet es opcional y solo aporta tu dirección
como identidad y la lectura de tu saldo de USDC. Ese saldo no se toca: las
apuestas de práctica usan el saldo ficticio.

En **modo real** la wallet sí firma: aprobaciones on-chain y órdenes EIP-712.
Ver la sección "Modo real" más abajo.

Detalle de implementación: wagmi v3 quitó el parámetro `token` de `useBalance`,
así que el saldo de un ERC20 se lee con `useReadContract` sobre `balanceOf`.
USDC en Polygon usa 6 decimales, no 18.

## Qué se descartó del intento anterior

El proyecto venía de un export de Google AI Studio al que se le había injertado
una capa de trading contra Polymarket. **No funcionaba**, y no era arreglable
tal como estaba:

- `getDefaultConfig` no existe en `@wagmi/core` v3 (es de RainbowKit / wagmi
  v1). Ese único import rompía el árbol entero y dejaba la pantalla en blanco.
- La ABI del CTF Exchange declaraba una función `trade(uint256, uint256)` que
  **no existe** en el contrato real. Cualquier orden habría revertido. Operar en
  Polymarket requiere firmar órdenes EIP-712 y enviarlas autenticadas a su CLOB
  API; no es una llamada directa al contrato.
- La dirección del contrato CTF estaba truncada a 39 caracteres hex en lugar de
  40, así que era inválida. (Ver "Sobre la dirección del CTF" más abajo: la
  primera corrección que se intentó también estaba mal.)
- `Web3Service.approveUSDC` era `async`, y su resultado se pasaba a
  `writeContractAsync` sin `await`: llegaba una `Promise`, no la configuración.
- `polymarketApi.ts` (276 líneas) no se importaba desde ningún sitio, y su tipo
  `outcomePrices: number[]` no coincidía con lo que devuelve la Gamma API.
- El "faucet de USDC" fingía una transacción y acreditaba saldo inventado. Como
  en Polygon Mainnet no existe ningún faucet de USDC, podía hacer creer que
  había fondos reales.
- `privateAccessCode` no se verificaba en ninguna parte: el candado era
  decorativo.

Se eliminó todo eso. Lo que quedó de esa capa es lo único que funcionaba de
verdad: conexión de wallet y lectura de saldo.

**Nota importante:** Polymarket no permite crear mercados propios sin aprobación
del protocolo. Por eso el modo práctica existe: para tener mercados tuyos. Lo
que sí se puede hacer contra Polymarket —leer sus mercados y operar en ellos— es
el modo real, implementado por la vía correcta (órdenes EIP-712 al CLOB) y no
con la llamada a contrato inexistente que había antes.

## Nota sobre OneDrive

El proyecto vive dentro de OneDrive, que mantiene handles abiertos sobre
`node_modules` y hace fallar al optimizador de dependencias de Vite con
`EPERM: operation not permitted, rmdir .vite/deps`.

`vite.config.ts` mueve `cacheDir` al directorio temporal del sistema para
evitarlo. Si algún día mueves el proyecto fuera de OneDrive, puedes quitar esa
línea.

---

# Modo real: Polymarket on-chain en Polygon

La app tiene dos modos, y arranca siempre en **Práctica**. Entrar en dinero real
es una decisión explícita.

| | Práctica | Real |
|---|---|---|
| Mercados | Los que tú creas | Los reales de Polymarket |
| Dinero | Ficticio, en localStorage | USDC.e real en tu wallet |
| Resolución | Tú la declaras | Oráculo UMA de Polymarket |
| Quién firma | Nadie | Tú, cada orden |

## Cómo se opera de verdad (no es lo que parece)

Polymarket **no** se opera llamando a un contrato. Es un CLOB híbrido:

```
1. Firmas un mensaje  -> derivas credenciales de API   (L1 auth, sin gas)
2. Firmas cada peticion con esas credenciales          (L2 auth, HMAC)
3. Firmas la orden como typed data EIP-712             (sin gas)
4. El operador la empareja y la liquida on-chain       (paga el operador)
```

Consecuencias prácticas:

- **Comprar no cuesta gas.** Lo que firmas es una orden, no una transacción.
- **Pero sí hacen falta dos aprobaciones on-chain previas**, que sí son
  transacciones tuyas y sí cuestan gas (céntimos en Polygon):
  1. `USDC.approve(exchange, monto)` — el exchange puede tomar tu colateral.
  2. `setApprovalForAll(exchange, true)` en el ERC1155 — el exchange puede
     entregar tus shares al vender. **Se olvida a menudo y hace que las ventas
     fallen sin motivo aparente.**
- Nadie puede mover tus fondos sin tu firma.

Se usa el SDK oficial `@polymarket/clob-client` v5, que acepta un `WalletClient`
de viem, así que encaja con wagmi sin adaptadores.

## Mercados negRisk

Los mercados de riesgo negativo (multi-resultado excluyente) usan **otro
exchange y otro contrato de shares**:

| | Estándar | negRisk |
|---|---|---|
| Exchange | `CTFExchange` | `NegRiskCtfExchange` |
| Shares a aprobar | `ConditionalTokens` | `NegRiskAdapter` |

Esto se verificó preguntando a cada exchange: `NegRiskCtfExchange.getCtf()`
devuelve el **adaptador**, no el CTF. Aprobar el contrato equivocado deja las
órdenes fallando.

## Direcciones, verificadas contra la cadena

Ninguna está copiada de documentación. Se obtuvieron del propio contrato
desplegado y coinciden con `getContractConfig(137)` del SDK:

| Contrato | Dirección |
|---|---|
| USDC.e (6 decimales) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| ConditionalTokens | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| CTFExchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| NegRiskCtfExchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| NegRiskAdapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` |

Para re-verificarlas: `CTFExchange.getCollateral()` y `CTFExchange.getCtf()`.

**Sobre la dirección del CTF.** El proyecto traía
`0x4D97DCd97eC945f40c65F87097ACe5EA0476045`: 39 caracteres hex, le faltaba una
`F` en el medio. En una revisión anterior se "corrigió" añadiendo una `A` al
final, lo que dio una dirección de longitud válida pero **inexistente** (sin
código on-chain). La correcta es la de la tabla, con `f40cF65F`.

## Trampas de las APIs, verificadas el 2026-08-26

**Gamma** devuelve `outcomes`, `outcomePrices` y `clobTokenIds` como **strings
que contienen JSON**, no como arrays:

```json
"clobTokenIds": "[\"27146956...\", \"33216695...\"]"
```

El código original los tipaba `number[]` y hacía `outcomePrices[0]`, lo que
devuelve el carácter `"["`. Se parsean explícitamente en `services/gammaApi.ts`.

**CLOB**: los endpoints correctos son `/book?token_id=`, `/price?token_id=&side=`,
`/midpoint?token_id=` y `/tick-size?token_id=`. Los que usaba el código anterior
(`/orderbook/{id}`, `/prices/{id}`) devuelven **404**.

**Orden del libro**: la API devuelve los bids ASCENDENTES y los asks
DESCENDENTES, o sea el mejor precio de cada lado está al **final** del array.
`services/clobApi.ts` los reordena para que `bids[0]` sea el mejor.

**CORS**: Gamma, CLOB y los RPC permiten llamadas directas desde el navegador.
No hace falta proxy.

## RPCs

Los que traía el proyecto estaban **todos caídos**:

| RPC | Estado |
|---|---|
| `polygon-rpc.com` | HTTP 401 "tenant disabled" |
| `polygon.llamarpc.com` | no resuelve |
| `1rpc.io/polygon` | HTTP 400 "unknown network" |
| `rpc.ankr.com/polygon` | exige API key |

Los que funcionan están en `config/polymarket.ts`. Para uso serio pon tu propio
endpoint en `VITE_POLYGON_RPC_URL`: los públicos limitan peticiones.

## Protecciones deliberadas

- **Aprobación por importe exacto, nunca `MaxUint256`.** Aprobar infinito es lo
  que explotan los contratos maliciosos, y sigue vivo mucho después de que dejes
  de usar la app.
- **Precio límite por defecto.** Sin límite aceptas cualquier precio del libro.
- **La previsualización recorre el libro de verdad** y muestra el precio medio
  ponderado y el peor precio, no el mejor. Una orden grande consume varios
  niveles y paga peor; enseñar solo el mejor precio sería engañar.
- **Redondeo al tick a favor del usuario**: al comprar hacia arriba, al vender
  hacia abajo, para que la orden entre.
- **Órdenes de mercado como FOK** (todo o nada), para no quedarte con un
  llenado parcial inesperado.
- **Validación antes de dejar firmar**: saldo, allowance, aprobación de shares,
  mínimo del mercado y rango del precio.

## Qué está verificado y qué no

Verificado ejecutándolo:

- Lectura de 50 mercados reales con liquidez real, parseo correcto.
- Libros de órdenes reales, con el orden de niveles corregido.
- Simulación de llenado con slippage real a través de varios niveles.
- Detección de `negRisk`, tick size y tamaño mínimo por mercado.
- **Construcción y firma de la orden EIP-712**: probado con una clave
  desechable. `makerAmount`/`takerAmount` salen con los 6 decimales correctos
  (100 shares a $0.09 -> 9000000 / 100000000) y la firma es una ECDSA válida
  de 65 bytes cuyo firmante coincide con la wallet.

**NO verificado de punta a punta** (requiere una wallet con fondos reales):

- El envío de la orden al CLOB (`postOrder`) y su liquidación on-chain.
- Las transacciones de aprobación.
- La respuesta real de Polymarket a las credenciales de API.

Polymarket restringe el acceso en algunas jurisdicciones. Si el CLOB responde
401/403, la app lo detecta y lo dice explícitamente: es un límite del operador,
no un fallo que se pueda arreglar desde el cliente.
