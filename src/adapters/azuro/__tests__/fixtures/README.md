# Fixtures de Azuro

Respuestas **reales** del Backend API de Azuro (Polygon, chainId 137),
capturadas el 2026-08-27 vía `@azuro-org/toolkit`:

- `games-prematch.json` — `getGamesByFilters` (página 1, 10 juegos). Incluye un
  juego real en estado `Stopped`.
- `conditions-by-game.json` — `getConditionsByGameIds` de los 3 primeros juegos.
  Mezcla condiciones `Active` y `Stopped` reales.
- `conditions-state.json` — `getConditionsState` (endpoint `condition-batch`).
- `bet-calculation.json` — `POST /bet/calculation` (minBet 1, maxBet 825).
- `bet-fee.json` — `GET /bet/gas-info`.
- `navigation.json` — `getNavigation` sin `sportHub` (deportes clásicos y
  esports). Capturado el 2026-08-28: 15 deportes; `table-tennis` con 0
  partidos prematch y `football` con 661, anclas del test de
  `listSubcategories`.

Excepción: `bets-by-bettor.synthetic.json` es **sintético** (no había una
cartera real con apuestas que consultar). Sigue la forma `BetOrderData` del
toolkit 6.5.0 campo a campo y reutiliza ids reales de los otros fixtures.

Para recapturar:

```
node scripts/dump-azuro-fixtures.mjs src/adapters/azuro/__tests__/fixtures
```

(recuerda que `getGamesByFilters` exige `perPage >= 10`, y revisa después los
anclajes de los tests: ids de juego/condición y cuotas concretas).

Nota: la API real se desvía de los tipos del toolkit (`margin` llega como
número, `category` como `null`). Es el motivo de que `validate.ts` no confíe
en los tipos declarados.

## Marcadores en vivo

`live-statistics.json` — snapshot REAL del socket de estadísticas en vivo
(`wss://streams.onchainfeed.org/v1/streams/statistics/games`), capturado el
2026-09-06 con 8 partidos EN JUEGO: 2 de fútbol, 4 de tenis y 2 de baloncesto
(virtual). Es el primer mensaje tras suscribirse: un array con una entrada
`{ id, fixture, live }` por juego.

El payload real se desvía mucho de los tipos del SDK y este fixture lo
documenta: en fútbol `scoreBoard` llega `{}` (el marcador está en
`live.stats.goals` y el minuto en el `timeline`); en tenis/baloncesto los
números y booleanos vienen como strings (`"4"`, `"true"`) y `-1` marca el
set/cuarto no jugado.

Para recapturar (hace falta que haya partidos en vivo de fútbol, tenis o
baloncesto en ese momento; el script avisa de lo que consiguió):

```
node scripts/dump-azuro-live-stats-fixtures.mjs src/adapters/azuro/__tests__/fixtures/live-statistics.json
```

(revisa después las anclas de `liveScores.test.ts`: ids de juego, marcadores,
minutos y parciales concretos).

## Cash out

`cashout-calculation.synthetic.json` es SINTÉTICO: sigue las formas declaradas
por el toolkit (`GetCalculatedCashoutResult`), porque a fecha 2026-09-01 la
API pública no sirve las rutas `/cashout/*` (404 en todas las cadenas) y no
hay respuesta real que capturar. Cuando Azuro despliegue el servicio:
capturar un cálculo real, sustituir este fixture y revisar las unidades de
`cashoutAmount` y `expiredAt`.
