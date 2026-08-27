# Fixtures de Limitless

Respuestas **reales** de `api.limitless.exchange` (Base, chainId 8453),
capturadas el 2026-08-27:

- `markets-active.json` — `GET /markets/active?limit=10` (mercados CLOB
  simples; envoltorio `{ data, totalMarketsCount }`).
- `markets-active-group.json` — `GET /markets/active?limit=2&tradeType=group`
  (grupos negRisk con submercados; el primero es un partido de fútbol, útil
  para probar la exclusión de deportes).
- `markets-search.json` — `GET /markets/search?query=bitcoin&limit=5`
  (envoltorio `{ markets }`).
- `market-detail.json` — `GET /markets/btc-up-or-down-5-min-1787843400`
  (FUNDED, con `venue.exchange`, `tokens` y `metadata.fee: true`).
- `orderbook.json` — libro real del mismo mercado. Notable: el lado YES solo
  tiene un ask a 0.998, INALCANZABLE para una orden (máximo 0.99) — caso real
  de "sin cotización ejecutable".
- `market-resolved.json` — `GET /markets/btc-up-or-down-5-min-1787842800`,
  mercado REALMENTE resuelto: `winningOutcomeIndex: 1` y `prices: [0, 1]`
  (los precios degeneran al resolverse; jamás renderizar como 0%/100%).

Excepciones **sintéticas** (los endpoints exigen token API autenticado y no
hay cuenta real con posiciones):

- `profile.synthetic.json` — forma de `GET /profiles/me` según la doc
  (id numérico + `rank.feeRateBps`).
- `positions.synthetic.json` — forma de `GET /portfolio/positions` según el
  OpenAPI oficial (`PortfolioPositionsDto`/`ClobPositionDto`), reutilizando
  slugs reales de los otros fixtures.

Para recapturar:

```
node scripts/dump-limitless-fixtures.mjs src/adapters/limitless/__tests__/fixtures
```

(y revisa después los anclajes de los tests: slugs, precios y niveles del
libro concretos).

La referencia de formas exactas es el OpenAPI oficial:
https://docs.limitless.exchange/openapi.json
