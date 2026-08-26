# Mapeo de la API de Polymarket

Inventario de todo lo que consumimos, **medido contra las APIs reales**, no
copiado de documentación. Última verificación: **2026-08-26**.

Tres servicios independientes:

| Servicio | Base | Auth | Para qué |
| --- | --- | --- | --- |
| Gamma | `https://gamma-api.polymarket.com` | No | Catálogo: eventos y mercados |
| CLOB | `https://clob.polymarket.com` | Según endpoint | Libros, precios, órdenes |
| RPC Polygon | ver `config/polymarket.ts` | No | Saldos, allowances, aprobaciones |

CORS permite llamar a los tres directamente desde el navegador. **No hace falta
proxy** (comprobado).

---

## Gamma API

### `GET /events` — fuente principal de la UI

Usado en `services/gammaApi.ts` → `fetchEventsPage()`.

**Es la fuente principal**, y no `/markets`, por dos razones medidas:

1. **El filtro por etiqueta solo funciona aquí.** Ver la trampa más abajo.
2. Los eventos traen `image`/`icon` y agrupan sus mercados. Un mercado suelto
   no tiene imagen ni el contexto del evento que lo agrupa.

Query params que usamos:

| Param | Valor | Nota |
| --- | --- | --- |
| `closed` | `false` | Solo eventos abiertos |
| `archived` | `false` | |
| `active` | `true` | |
| `limit` | `100` | **Máximo real 100.** Pedir 500 devuelve 100 sin error |
| `offset` | `0`, `100`, … | Paginación. HTTP **422** pasado ~2100 |
| `order` | `volume24hr` \| `liquidity` \| `creationDate` | En `/events` es `liquidity`, no `liquidityNum` |
| `ascending` | `false` | |
| `tag_slug` | `politics`, `soccer`… | **Solo se respeta en este endpoint** |

Campos que extraemos del evento (`normalizeEvent`):

- Identidad: `id`, `title`, `slug`, `description`
- **Visual: `image`, `icon`** (S3 de Polymarket). El 100% de los eventos los trae
- Métricas: `liquidity`, `volume`, `volume24hr`, `openInterest`, `commentCount`
- Estado: `new`, `featured`, `live`, `endDate`
- Clasificación: `tags[].slug`
- **`markets[]`**: los mercados del evento, con todo lo necesario para operar

### `GET /markets` — catálogo plano

Usado en `fetchMarketsPage()`. Se conserva para el modo de listado plano y como
respaldo, pero **la UI ya no depende de él**.

Params extra frente a `/events`: `enableOrderBook=true` (imprescindible: sin
libro no se puede operar) y `order=liquidityNum`/`volume24hr`/`volumeNum`.

### ⚠️ Trampa: `tag_slug` se ignora en `/markets`

Medido comparando IDs de respuesta:

```
/markets?tag_slug=politics          -> 559681, 559677, 559687
/markets?tag_slug=sports            -> 559681, 559677, 559687   (idénticos)
/markets?tag_slug=esto-no-existe    -> 559681, 559677, 559687   (idénticos)
```

El parámetro **se descarta en silencio**. Construir pestañas de categoría sobre
`/markets?tag_slug=` produce una UI que parece funcionar mostrando siempre lo
mismo. En `/events` sí filtra (verificado: `politics` y `sports` devuelven
conjuntos distintos).

### ⚠️ Trampa: campos que son strings con JSON dentro

En el objeto mercado, estos **no son arrays**:

```json
"clobTokenIds":  "[\"27146956...\", \"33216695...\"]",
"outcomes":      "[\"Yes\", \"No\"]",
"outcomePrices": "[\"0.095\", \"0.905\"]"
```

Hay que `JSON.parse`. Tiparlos como `number[]` y hacer `outcomePrices[0]`
devuelve el carácter `"["` — era el bug de la versión anterior del proyecto.

### `GET /tags`

Probado y **descartado**: devuelve miles de etiquetas granulares sin jerarquía
(`caitlin-clark`, `virgins`, `Timothée Chalamet`). No sirve para construir la
navegación principal. Las categorías se fijan en código a partir de los slugs
verificados.

### `GET /public-search?q=…`

Existe y funciona (devuelve `{events, pagination}`). **No integrado todavía**: la
búsqueda actual filtra en cliente sobre lo cargado. Es la vía para buscar en todo
el catálogo sin descargarlo.

---

## CLOB API

### Endpoints públicos, sin auth

Usados en `services/clobApi.ts`:

| Endpoint | Devuelve | Usado para |
| --- | --- | --- |
| `GET /book?token_id=` | `{bids:[{price,size}], asks:[…]}` | Libro en vivo, refresco 8 s |
| `GET /price?token_id=&side=` | `{price:"0.005"}` | Precio de un lado |
| `GET /midpoint?token_id=` | `{mid:"0.006"}` | Punto medio |
| `GET /tick-size?token_id=` | `{minimum_tick_size:0.001}` | Validar el precio límite |

**⚠️ Orden de los niveles:** la API devuelve los `bids` **ascendentes** y los
`asks` **descendentes**. El mejor precio de cada lado está al **final** del
array. `fetchOrderBook` los reordena para que `bids[0]` sea el mejor.

**⚠️ Endpoints inexistentes** que usaba el código anterior: `/orderbook/{id}` y
`/prices/{id}` devuelven **404**.

### Endpoints autenticados

Vía el SDK oficial `@polymarket/clob-client` en `hooks/useClobTrading.ts`:

| Operación | Auth | Nota |
| --- | --- | --- |
| `deriveApiKey()` / `createApiKey()` | L1 (firma) | Deriva credenciales. Sin gas |
| `createOrder()` / `createMarketOrder()` | — | Firma EIP-712 local |
| `postOrder()` | L2 (HMAC) | Envía la orden firmada |
| `getOpenOrders()` | L2 | Órdenes vivas |
| `cancelOrder()` | L2 | Cancelar |
| `getTrades()` | L2 | Historial |

**Polymarket no se opera llamando a un contrato.** Se firma una orden EIP-712,
se envía autenticada, y el operador la liquida on-chain. Detalles en
`ARQUITECTURA.md`.

### No integrado: WebSocket

`wss://ws-subscriptions-clob.polymarket.com` daría libro y trades en streaming.
Hoy usamos polling (8 s el libro, 20 s el catálogo), que es suficiente y más
simple. Es la mejora natural si se quiere latencia menor.

---

## RPC de Polygon

Lecturas y transacciones en `hooks/useOnchainAccount.ts`:

| Contrato | Función | Para qué |
| --- | --- | --- |
| USDC.e | `balanceOf` | Tu saldo real |
| USDC.e | `allowance` | Cuánto puede gastar el exchange |
| USDC.e | `approve` | **Transacción tuya.** Importe exacto, nunca ilimitado |
| ConditionalTokens | `balanceOf` | Shares que posees |
| ConditionalTokens | `isApprovedForAll` | ¿Puede el exchange mover tus shares? |
| ConditionalTokens | `setApprovalForAll` | **Transacción tuya.** Necesaria para vender |
| CTFExchange | `getCollateral` / `getCtf` | Verificar direcciones contra la cadena |

Direcciones verificadas en `config/polymarket.ts`. **Los RPCs que traía el
proyecto estaban todos caídos**; los vigentes están ahí documentados.

---

## Sincronización automática

Ningún dato depende de que el usuario pulse nada.

| Qué | Cada cuánto | Cómo |
| --- | --- | --- |
| Catálogo de eventos | 20 s | Refresca precios **en sitio**, sin reordenar |
| Libro de órdenes | 8 s | `useOrderBook`, mientras el panel esté abierto |
| Saldo y allowances | 30 s | `useReadContracts` de wagmi |
| Paginación | Al hacer scroll | `IntersectionObserver`, sin botones |

Dos decisiones deliberadas:

- **El refresco no reordena ni añade eventos.** Si el listado se recolocara bajo
  el cursor, un clic podría acabar en un mercado distinto del pretendido.
- **No se refresca con la pestaña oculta** (`document.hidden`): gastaría
  peticiones sin que nadie lo mire. Al volver, sincroniza de inmediato.

---

## Categorías, verificadas una a una

Slugs con eventos reales. Se probaron ~70 candidatos.

**Principales:** `politics`, `sports`, `crypto`, `esports`, `geopolitics`,
`finance`, `economy`, `tech`, `pop-culture`, `weather`, `elections`, `awards`.

**Deportes (subcategorías):** `soccer`, `basketball`, `mlb`, `tennis`, `nfl`,
`f1`, `ufc`, `nhl`, `golf`, `esports`, `cricket`, `chess`.

**No existen** (devuelven 0 eventos), pese a parecer obvios:

```
entertainment   financials   companies   culture   mentions
formula-1 (el correcto es f1)   college-basketball
athletics   darts   snooker
```

**Solapamientos**, resueltos por liquidez: `baseball`/`mlb` → `mlb`;
`football`/`nfl` → `nfl`; `epl`/`premier-league` → `premier-league`;
`mma`/`ufc` → `ufc`.

"Tendencia" y "Nuevo" no son etiquetas: son el catálogo ordenado por
`volume24hr` y `creationDate` respectivamente.

---

## Paridad de catálogo: por qué faltaban mercados

Auditoría del 2026-08-26. **Nuestros filtros no descartaban ni un evento** (0 de
100 en todas las categorías probadas). El problema era otro, y tiene dos partes.

### 1. La ventana de `/events` se corta en ~2.100

`/events` ordenado por `volume24hr` devuelve como mucho ~2.100 eventos (HTTP 422
más allá), y **todos tienen volumen > 0**. Un evento de nicho queda enterrado
tan abajo que es inalcanzable por mucho que se pagine.

Ejemplo medido: `"Spider-Man: Brand New Day" 5th Weekend Box Office`
(`vol24h=2201`, activo, abierto) **no aparece en la primera página de ninguna
ordenación** —ni `volume24hr`, ni `startDate`, ni `creationDate`, ni `id`— pero
sí se obtiene por `slug` o por su etiqueta `box-office`.

**Cada etiqueta tiene su propia ventana de resultados.** Por eso las
subcategorías no son cosmética: son la única vía práctica de alcanzar taquilla,
temperaturas o premios menores.

### 2. Un filtro nuestro sí ocultaba lo nuevo

`normalizeEvent` exigía `acceptingOrders === true`. Eso escondía eventos recién
creados cuyo libro aún no ha abierto — justo los que deben salir en "Nuevo".
Ahora basta con `enableOrderBook`, y los no operables llegan marcados para que
la UI lo indique en vez de esconderlos.

**No hay ningún filtro por liquidez ni por volumen en ningún punto del código.**

### `GET /public-search` — búsqueda global

Ya integrado (`searchEvents`). Es el buscador de la web oficial.

| Param | Valor |
| --- | --- |
| `q` | Texto libre |
| `limit_per_type` | Hasta 100 |
| `page` | 1, 2, 3… (`pagination.hasMore` indica si sigue) |
| `events_status` | `active` |

Devuelve eventos con **exactamente la misma forma** que `/events`, mercados
operables incluidos, así que reutiliza `normalizeEvent`.

Es lo que cierra el hueco de paridad: `/events` llega a ~2.100 eventos, la
búsqueda al corpus completo (la API reporta **121.143** resultados). Verificado
alcanzando eventos de `vol24h = 5` y `vol24h = 8`, inaccesibles paginando.

### Etiquetas añadidas en esta pasada

`box-office`, `movies`, `tv`, `music`, `celebrities`, `oscars`, `emmys`,
`grammys`, `stocks`, `oil`, `gold`, `forex`, `earnings`, `business`, `space`,
`science`, `ai`, `openai`, `bitcoin`, `ethereum`, `video-games`, `gaming`,
`russia`, `ukraine`, `israel`, `china`, `middle-east`, `congress`, `courts`,
`immigration`, `inflation`, `fed`, `finance`, `climate`.

**No existen** (0 eventos), pese a parecer evidentes: `news`, `breaking-news`,
`current-events`, `legal-cases`, `companies`, `nobel`, `person-of-the-year`.
Los "sucesos recientes" se cubren con la pestaña **Nuevo**
(`order=creationDate`) y con `geopolitics` / `trump` / `congress`.
