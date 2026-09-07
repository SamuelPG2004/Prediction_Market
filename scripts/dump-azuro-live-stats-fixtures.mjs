// Recaptura la fixture del socket de estadísticas en vivo de Azuro: se
// suscribe a partidos EN JUEGO ahora mismo y guarda VERBATIM el snapshot
// inicial (un array con una entrada por juego).
//
// La calidad de la fixture depende de qué haya en juego al ejecutarlo: mejor
// lanzarlo cuando haya al menos un partido de fútbol, uno de tenis/voleibol y
// uno de baloncesto en vivo (el script avisa de lo que consiguió).
//
// Requiere WebSocket global (Node 22+) o el paquete `ws` resoluble (hoy llega
// como dependencia transitiva de vite).
import { writeFileSync } from 'node:fs'
import { GameState, getGamesByFilters, getSocketEndpoint } from '@azuro-org/toolkit'

const outFile = process.argv[2]
if (!outFile) {
  throw new Error('uso: node dump-azuro-live-stats-fixtures.mjs <archivo-salida>')
}

const WebSocketImpl =
  globalThis.WebSocket ?? (await import('ws')).default

const chainId = 137
// Deportes con estadísticas en vivo (fútbol, baloncesto, tenis, voleibol) y
// proveedor 6: los mismos filtros que aplica el SDK oficial.
const SUPPORTED_SPORTS = [33, 31, 45, 26]
const providerOf = (gameId) => Number(gameId.slice(1, 4))

const live = await getGamesByFilters({
  chainId,
  state: GameState.Live,
  page: 1,
  perPage: 20,
})

const candidates = live.games.filter(
  (g) =>
    SUPPORTED_SPORTS.includes(Number(g.sport.sportId)) &&
    providerOf(g.gameId) === 6,
)
if (candidates.length === 0) {
  throw new Error('no hay partidos en vivo de deportes soportados ahora mismo')
}
console.log(`suscribiendo a ${candidates.length} partidos en vivo:`)
for (const g of candidates) console.log(`  [${g.sport.slug}] ${g.title}`)

const socket = new WebSocketImpl(`${getSocketEndpoint(chainId)}/statistics/games`)
const timeout = setTimeout(() => {
  console.error('timeout: el socket no envió el snapshot en 30s')
  process.exit(1)
}, 30_000)

socket.addEventListener('open', () => {
  socket.send(
    JSON.stringify({
      action: 'subscribe',
      gameIds: candidates.map((g) => g.gameId),
    }),
  )
})

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data.toString())
  // El snapshot es el primer array no vacío; los siguientes son incrementales.
  if (!Array.isArray(message) || message.length === 0) return
  clearTimeout(timeout)
  writeFileSync(outFile, JSON.stringify(message, null, 2))
  const sports = new Set(
    message.map((e) => e.fixture?.sport?.name ?? 'desconocido'),
  )
  console.log(
    `ok ${outFile}: ${message.length} entradas (${[...sports].join(', ')})`,
  )
  socket.close(3000)
  process.exit(0)
})
