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
