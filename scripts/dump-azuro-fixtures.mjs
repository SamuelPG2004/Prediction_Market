// Captura respuestas reales del Backend API de Azuro (Polygon, chainId 137)
// vía @azuro-org/toolkit y las vuelca como fixtures JSON para los tests.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GameState,
  getGamesByFilters,
  getConditionsByGameIds,
  getConditionsState,
  getBetCalculation,
  getBetFee,
  getNavigation,
} from '@azuro-org/toolkit'

const outDir = process.argv[2]
if (!outDir) throw new Error('uso: node dump-azuro-fixtures.mjs <dir-salida>')
mkdirSync(outDir, { recursive: true })

const save = (name, data) => {
  writeFileSync(join(outDir, name), JSON.stringify(data, null, 2))
  console.log(`ok ${name}`)
}

const chainId = 137

const gamesPage = await getGamesByFilters({
  chainId,
  state: GameState.Prematch,
  page: 1,
  perPage: 10, // mínimo que acepta la API
})
save('games-prematch.json', gamesPage)

const gameIds = gamesPage.games.slice(0, 3).map((g) => g.gameId)
const conditions = await getConditionsByGameIds({ chainId, gameIds })
save('conditions-by-game.json', conditions)

const conditionIds = conditions.slice(0, 3).map((c) => c.conditionId)
const states = await getConditionsState({ chainId, conditionIds })
save('conditions-state.json', states)

const first = conditions.find((c) => c.outcomes.length > 0)
if (first) {
  const calc = await getBetCalculation({
    chainId,
    selections: [
      { conditionId: first.conditionId, outcomeId: first.outcomes[0].outcomeId },
    ],
    account: undefined,
  })
  save('bet-calculation.json', calc)
}

const fee = await getBetFee(chainId)
save('bet-fee.json', fee)

// Sin sportHub a propósito: trae deportes clásicos Y esports, que el dominio
// agrupa ambos bajo la categoría 'sports'.
const navigation = await getNavigation({ chainId })
save('navigation.json', navigation)
