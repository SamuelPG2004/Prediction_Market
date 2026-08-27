// Captura respuestas reales de la API pública de Limitless (Base) y las
// vuelca como fixtures JSON para los tests. Solo endpoints públicos; el
// perfil y las posiciones exigen token API y sus fixtures son sintéticos
// (ver el README de fixtures).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const API = 'https://api.limitless.exchange'

const outDir = process.argv[2]
if (!outDir) throw new Error('uso: node dump-limitless-fixtures.mjs <dir-salida>')
mkdirSync(outDir, { recursive: true })

async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return res.json()
}

const save = (name, data) => {
  writeFileSync(join(outDir, name), JSON.stringify(data, null, 2))
  console.log(`ok ${name}`)
}

const active = await get('/markets/active?limit=10')
save('markets-active.json', active)

save('markets-active-group.json', await get('/markets/active?limit=2&tradeType=group'))
save('markets-search.json', await get('/markets/search?query=bitcoin&limit=5'))

const funded = active.data.find((m) => m.status === 'FUNDED')
if (!funded) throw new Error('no hay mercado FUNDED en la primera página')
save('market-detail.json', await get(`/markets/${funded.slug}`))
save('orderbook.json', await get(`/markets/${funded.slug}/orderbook`))

// Un mercado resuelto real: la ventana de 5 minutos anterior a la actual.
const prevSlug = funded.slug.replace(/(\d+)$/, (ts) => String(Number(ts) - 300))
try {
  save('market-resolved.json', await get(`/markets/${prevSlug}`))
} catch {
  console.warn(`aviso: no se pudo capturar el mercado resuelto (${prevSlug})`)
}
