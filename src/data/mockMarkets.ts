import { PredictionMarket, SupportedNetwork, UserPosition, Web3Transaction } from '../types';

export const SUPPORTED_NETWORKS: SupportedNetwork[] = [
  {
    id: 137,
    name: 'Polygon Mainnet',
    shortName: 'Polygon',
    icon: 'polygon',
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    currency: 'MATIC',
  },
  {
    id: 42161,
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    icon: 'arbitrum',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    currency: 'ETH',
  },
  {
    id: 8453,
    name: 'Base Mainnet',
    shortName: 'Base',
    icon: 'base',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    currency: 'ETH',
  },
  {
    id: 1,
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    icon: 'ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    currency: 'ETH',
  },
];

// Default network for Polymarket operations
export const DEFAULT_NETWORK = SUPPORTED_NETWORKS[0]; // Polygon Mainnet

export const INITIAL_MARKETS: PredictionMarket[] = [
  {
    id: 'm-btc-100k',
    title: '¿Bitcoin ($BTC) superará los $100,000 USD antes de fin de mes?',
    description: 'Este mercado se resolverá como "SÍ" si el precio spot de Bitcoin en Binance / Coinbase alcanza o supera los $100,000.00 USD en cualquier momento antes de las 23:59:59 UTC del último día del mes corriente.',
    category: 'Crypto',
    resolutionDate: '2026-08-31T23:59:59Z',
    resolutionSource: 'Chainlink Price Feed & Coinbase Spot Aggregate',
    yesProbability: 74,
    noProbability: 26,
    yesPriceUsd: 0.74,
    noPriceUsd: 0.26,
    volume24hUsd: 1420500,
    totalLiquidityUsd: 3850000,
    iconName: 'bitcoin',
    badge: '🔥 Tendencia',
    status: 'active',
    rules: [
      'El oráculo toma como referencia la media ponderada por volumen (VWAP) en los principales CEX.',
      'Basta con tocar o superar los $100,000.00 en vela de 1 minuto.',
      'Resolución automática verificada por smart contract.'
    ],
    sparkline: [58, 62, 60, 65, 69, 71, 74],
    recentTrades: [
      { type: 'YES', amountUsd: 1250, shares: 1689.18, timestamp: 'hace 2 min', wallet: '0x8f...4e1a' },
      { type: 'YES', amountUsd: 500, shares: 675.67, timestamp: 'hace 5 min', wallet: '0x3c...90bf' },
      { type: 'NO', amountUsd: 200, shares: 769.23, timestamp: 'hace 11 min', wallet: '0x1a...65ec' },
    ]
  },
  {
    id: 'm-fed-rate-cut',
    title: '¿La Reserva Federal (FED) recortará las tasas de interés en ≥25 bps en su próxima reunión?',
    description: 'Se resolverá en "SÍ" si el Comité Federal de Mercado Abierto (FOMC) anuncia una reducción en la tasa de fondos federales de al menos 25 puntos básicos.',
    category: 'Macro',
    resolutionDate: '2026-09-17T18:00:00Z',
    resolutionSource: 'Federal Reserve Official Statement & CME FedWatch',
    yesProbability: 82,
    noProbability: 18,
    yesPriceUsd: 0.82,
    noPriceUsd: 0.18,
    volume24hUsd: 980400,
    totalLiquidityUsd: 2410000,
    iconName: 'landmark',
    badge: 'Macro Clave',
    status: 'active',
    rules: [
      'Fuente oficial: Comunicado oficial en federalreserve.gov.',
      'Si se mantienen o aumentan las tasas, resuelve como "NO".',
      'Resolución en 24h tras la rueda de prensa oficial de la FED.'
    ],
    sparkline: [70, 72, 75, 78, 80, 81, 82],
    recentTrades: [
      { type: 'YES', amountUsd: 3000, shares: 3658.53, timestamp: 'hace 4 min', wallet: '0x71...3b8a' },
      { type: 'NO', amountUsd: 850, shares: 4722.22, timestamp: 'hace 18 min', wallet: '0x99...2210' },
    ]
  },
  {
    id: 'm-eth-pectra',
    title: '¿Ethereum activará la actualización Pectra en Mainnet antes del 1 de Noviembre?',
    description: 'El mercado se resolverá positivamente si la hard fork Pectra (Prague + Electra) es ejecutada con éxito en la red principal de Ethereum en o antes de la fecha límite especificada.',
    category: 'Crypto',
    resolutionDate: '2026-11-01T00:00:00Z',
    resolutionSource: 'Ethereum Consensus Specs / Beaconcha.in',
    yesProbability: 66,
    noProbability: 34,
    yesPriceUsd: 0.66,
    noPriceUsd: 0.34,
    volume24hUsd: 630200,
    totalLiquidityUsd: 1720000,
    iconName: 'ethereum',
    status: 'active',
    rules: [
      'Verificación a través del número de epoch de activación acordado por core developers.',
      'Si se retrasa a una fecha posterior a Noviembre 2026, resuelve "NO".'
    ],
    sparkline: [50, 54, 58, 62, 65, 63, 66],
    recentTrades: [
      { type: 'YES', amountUsd: 1500, shares: 2272.72, timestamp: 'hace 9 min', wallet: '0x44...01ab' },
      { type: 'YES', amountUsd: 400, shares: 606.06, timestamp: 'hace 22 min', wallet: '0x62...aa99' },
    ]
  },
  {
    id: 'm-sol-dex-volume',
    title: '¿Solana superará a Ethereum en volumen DEX acumulado durante los próximos 30 días?',
    description: 'Se resolverá según el volumen total de intercambio descentralizado (DEX Volume) registrado en DefiLlama comparando las redes de Solana y Ethereum L1.',
    category: 'Crypto',
    resolutionDate: '2026-09-24T23:59:59Z',
    resolutionSource: 'DefiLlama DEX Volume API / UMA Oracle',
    yesProbability: 41,
    noProbability: 59,
    yesPriceUsd: 0.41,
    noPriceUsd: 0.59,
    volume24hUsd: 875100,
    totalLiquidityUsd: 1950000,
    iconName: 'activity',
    badge: '⚔️ Versus',
    status: 'active',
    rules: [
      'Solo se compara Ethereum Capa 1 (L1) sin incluir Rollups L2.',
      'Período exacto de 30 días consecutivos.'
    ],
    sparkline: [48, 45, 42, 40, 38, 40, 41],
    recentTrades: [
      { type: 'NO', amountUsd: 2100, shares: 3559.32, timestamp: 'hace 1 min', wallet: '0xcc...8831' },
      { type: 'YES', amountUsd: 750, shares: 1829.26, timestamp: 'hace 14 min', wallet: '0x02...55e4' },
    ]
  },
  {
    id: 'm-ai-benchmark-diamond',
    title: '¿Un modelo de IA superará el 92% en GPQA Diamond este año?',
    description: 'Resuelve "SÍ" si un laboratorio de IA (OpenAI, Google DeepMind, Anthropic u open source verificado) publica resultados auditados superando el 92% en el benchmark GPQA Diamond sin ayuda humana.',
    category: 'AI & Tech',
    resolutionDate: '2026-12-31T23:59:59Z',
    resolutionSource: 'HuggingFace Leaderboard / Peer Reviewed Evaluation',
    yesProbability: 89,
    noProbability: 11,
    yesPriceUsd: 0.89,
    noPriceUsd: 0.11,
    volume24hUsd: 1150000,
    totalLiquidityUsd: 3100000,
    iconName: 'cpu',
    badge: '⚡ Alta Conviction',
    status: 'active',
    rules: [
      'Evaluación bajo condiciones estandarizadas zero-shot o chain-of-thought.',
      'Debe estar documentado en un paper oficial o suite pública de evaluación.'
    ],
    sparkline: [75, 78, 82, 85, 87, 88, 89],
    recentTrades: [
      { type: 'YES', amountUsd: 5000, shares: 5617.97, timestamp: 'hace 7 min', wallet: '0xaa...12ef' },
    ]
  },
  {
    id: 'm-us-btc-strategic-reserve',
    title: '¿Estados Unidos promulgará la creación de una Reserva Estratégica de Bitcoin?',
    description: 'Se resolverá en "SÍ" si el Congreso de los Estados Unidos o una Orden Ejecutiva Federal establece formalmente la compra/retención de Bitcoin como activo de reserva del Tesoro de EE. UU.',
    category: 'Geopolitics',
    resolutionDate: '2026-12-31T23:59:59Z',
    resolutionSource: 'US Congress Official Records / Federal Register',
    yesProbability: 53,
    noProbability: 47,
    yesPriceUsd: 0.53,
    noPriceUsd: 0.47,
    volume24hUsd: 1890000,
    totalLiquidityUsd: 4200000,
    iconName: 'globe',
    status: 'active',
    rules: [
      'Debe ser una ley firmada o acción ejecutiva con fuerza vinculante.',
      'Menciones preliminares o borradores no aprobados no cuentan.'
    ],
    sparkline: [35, 42, 48, 55, 51, 52, 53],
    recentTrades: [
      { type: 'YES', amountUsd: 1200, shares: 2264.15, timestamp: 'hace 15 min', wallet: '0x55...39bb' },
      { type: 'NO', amountUsd: 1100, shares: 2340.42, timestamp: 'hace 30 min', wallet: '0x11...77aa' },
    ]
  },
  {
    id: 'm-private-syndicate-1',
    title: '[PRIVADO] Syndicate Alpha: ¿Token $AETHER alcanzará $25M FDV en las primeras 48h post-TGE?',
    description: 'Mercado privado exclusivo para miembros del sindicato de inversión Aether. Resolución mediante votación de gobernanza multisig 3/5.',
    category: 'Private',
    resolutionDate: '2026-10-15T12:00:00Z',
    resolutionSource: 'Aether Syndicate Multisig 0x9B4...F12C (3 de 5)',
    yesProbability: 58,
    noProbability: 42,
    yesPriceUsd: 0.58,
    noPriceUsd: 0.42,
    volume24hUsd: 420000,
    totalLiquidityUsd: 850000,
    iconName: 'shield',
    badge: '🔒 Sindicato Privado',
    isPrivate: true,
    privateAccessCode: 'ALPHA2026',
    creatorAddress: '0x71C...3b8a',
    status: 'active',
    rules: [
      'Mercado con acceso restringido por código de invitación o token gate.',
      'Resolución oráculo descentralizada por Safe Multisig.'
    ],
    sparkline: [40, 45, 52, 55, 54, 56, 58],
    recentTrades: [
      { type: 'YES', amountUsd: 2500, shares: 4310.34, timestamp: 'hace 1 hora', wallet: '0x71...3b8a' },
    ]
  },
  {
    id: 'm-nvidia-4t',
    title: '¿NVIDIA ($NVDA) alcanzará los $4.0 Trillones de Market Cap antes de Q4 2026?',
    description: 'El mercado se resolverá como "SÍ" si la capitalización bursátil de mercado de NVIDIA Corporation supera los $4,000,000,000,000 USD según los datos de cierre o intra-día de NASDAQ.',
    category: 'AI & Tech',
    resolutionDate: '2026-09-30T20:00:00Z',
    resolutionSource: 'NASDAQ Official Market Data / Bloomberg',
    yesProbability: 68,
    noProbability: 32,
    yesPriceUsd: 0.68,
    noPriceUsd: 0.32,
    volume24hUsd: 790000,
    totalLiquidityUsd: 2150000,
    iconName: 'trending-up',
    status: 'active',
    rules: [
      'Calculado como precio de acción multiplicado por número de acciones en circulación (shares outstanding) oficial.'
    ],
    sparkline: [52, 56, 60, 64, 67, 65, 68],
    recentTrades: [
      { type: 'YES', amountUsd: 800, shares: 1176.47, timestamp: 'hace 35 min', wallet: '0x88...c112' },
    ]
  },
  {
    id: 'm-ucl-realmadrid-mancity',
    title: '¿El Real Madrid clasificará a la Final de la UEFA Champions League?',
    description: 'Este mercado se resolverá en "SÍ" si el Real Madrid Club de Fútbol avanza de ronda y sella su clasificación a la Gran Final de la UEFA Champions League según el acta arbitral y reporte oficial de UEFA.',
    category: 'Sports',
    resolutionDate: '2026-05-30T22:00:00Z',
    resolutionSource: 'UEFA Official Match Report & Opta Sports Data Feed',
    yesProbability: 63,
    noProbability: 37,
    yesPriceUsd: 0.63,
    noPriceUsd: 0.37,
    volume24hUsd: 2150000,
    totalLiquidityUsd: 4800000,
    iconName: 'trophy',
    badge: '⚽ Champions League',
    status: 'active',
    rules: [
      'Resolución basada estrictamente en el resultado oficial y certificado emitido por UEFA.com.',
      'Incluye prórroga y tanda de penales en caso de empate global en la eliminatoria.',
      'Verificación on-chain mediante Oracle UMA / SportsDataIO.'
    ],
    sparkline: [48, 52, 55, 59, 61, 60, 63],
    recentTrades: [
      { type: 'YES', amountUsd: 3500, shares: 5555.55, timestamp: 'hace 3 min', wallet: '0x9a...712c' },
      { type: 'NO', amountUsd: 1200, shares: 3243.24, timestamp: 'hace 14 min', wallet: '0x44...88ef' },
      { type: 'YES', amountUsd: 800, shares: 1269.84, timestamp: 'hace 27 min', wallet: '0x0d...55a1' },
    ]
  },
  {
    id: 'm-barca-laliga-champion',
    title: '¿El FC Barcelona se coronará Campeón de LaLiga EA Sports esta temporada?',
    description: 'Se resolverá como "SÍ" si el FC Barcelona finaliza en la primera posición de la tabla general tras disputar las 38 jornadas oficiales del campeonato español.',
    category: 'Sports',
    resolutionDate: '2026-05-24T20:00:00Z',
    resolutionSource: 'LaLiga EA Sports Official Standings / RFEF Records',
    yesProbability: 56,
    noProbability: 44,
    yesPriceUsd: 0.56,
    noPriceUsd: 0.44,
    volume24hUsd: 1480000,
    totalLiquidityUsd: 3350000,
    iconName: 'trophy',
    badge: '🏆 LaLiga EA Sports',
    status: 'active',
    rules: [
      'El campeón oficial proclamado por la Real Federación Española de Fútbol (RFEF) determinará el resultado.',
      'En caso de igualdad de puntos, se aplicarán las normas oficiales de desempate de la competición.'
    ],
    sparkline: [44, 46, 50, 52, 55, 54, 56],
    recentTrades: [
      { type: 'YES', amountUsd: 1800, shares: 3214.28, timestamp: 'hace 8 min', wallet: '0x12...fa09' },
      { type: 'NO', amountUsd: 950, shares: 2159.09, timestamp: 'hace 19 min', wallet: '0xbb...34c1' },
    ]
  },
  {
    id: 'm-arsenal-mancity-goals',
    title: '¿Habrá más de 2.5 goles en el partido Arsenal FC vs Manchester City?',
    description: 'El mercado se resolverá en "SÍ" si el total de goles anotados entre ambos clubes es de 3 o más (Over 2.5) al término de los 90 minutos reglamentarios más el tiempo de descuento otorgado por el árbitro.',
    category: 'Sports',
    resolutionDate: '2026-09-28T17:30:00Z',
    resolutionSource: 'Premier League Official Match Center / API-Football Oracle',
    yesProbability: 71,
    noProbability: 29,
    yesPriceUsd: 0.71,
    noPriceUsd: 0.29,
    volume24hUsd: 1820000,
    totalLiquidityUsd: 3900000,
    iconName: 'activity',
    badge: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League',
    status: 'active',
    rules: [
      'Goles computados exclusivamente durante el tiempo reglamentario más adición oficial.',
      'Goles anulados formalmente por el VAR no serán contabilizados.'
    ],
    sparkline: [60, 64, 65, 68, 70, 69, 71],
    recentTrades: [
      { type: 'YES', amountUsd: 2200, shares: 3098.59, timestamp: 'hace 6 min', wallet: '0xfe...9921' },
      { type: 'YES', amountUsd: 1100, shares: 1549.29, timestamp: 'hace 12 min', wallet: '0x33...bb88' },
      { type: 'NO', amountUsd: 500, shares: 1724.13, timestamp: 'hace 40 min', wallet: '0x71...3b8a' },
    ]
  }
];

export const INITIAL_POSITIONS: UserPosition[] = [
  {
    id: 'pos-1',
    marketId: 'm-btc-100k',
    marketTitle: '¿Bitcoin ($BTC) superará los $100,000 USD antes de fin de mes?',
    category: 'Crypto',
    outcome: 'YES',
    sharesCount: 1689.18,
    avgPricePaidUsd: 0.68,
    totalCostUsd: 1148.64,
    currentPriceUsd: 0.74,
    currentValueUsd: 1250.00,
    pnlUsd: 101.36,
    pnlPercentage: 8.82,
    timestamp: '2026-08-24T09:15:00Z'
  },
  {
    id: 'pos-2',
    marketId: 'm-fed-rate-cut',
    marketTitle: '¿La Reserva Federal (FED) recortará las tasas de interés en ≥25 bps en su próxima reunión?',
    category: 'Macro',
    outcome: 'YES',
    sharesCount: 3658.53,
    avgPricePaidUsd: 0.75,
    totalCostUsd: 2743.90,
    currentPriceUsd: 0.82,
    currentValueUsd: 3000.00,
    pnlUsd: 256.10,
    pnlPercentage: 9.33,
    timestamp: '2026-08-23T14:20:00Z'
  },
  {
    id: 'pos-3',
    marketId: 'm-private-syndicate-1',
    marketTitle: '[PRIVADO] Syndicate Alpha: ¿Token $AETHER alcanzará $25M FDV?',
    category: 'Private',
    outcome: 'YES',
    sharesCount: 4310.34,
    avgPricePaidUsd: 0.50,
    totalCostUsd: 2155.17,
    currentPriceUsd: 0.58,
    currentValueUsd: 2500.00,
    pnlUsd: 344.83,
    pnlPercentage: 16.00,
    timestamp: '2026-08-22T18:00:00Z'
  },
  {
    id: 'pos-4',
    marketId: 'm-ucl-realmadrid-mancity',
    marketTitle: '¿El Real Madrid clasificará a la Final de la Champions?',
    category: 'Sports',
    outcome: 'YES',
    sharesCount: 2000.00,
    avgPricePaidUsd: 0.58,
    totalCostUsd: 1160.00,
    currentPriceUsd: 0.63,
    currentValueUsd: 1260.00,
    pnlUsd: 100.00,
    pnlPercentage: 8.62,
    timestamp: '2026-08-24T10:45:00Z'
  }
];

export const INITIAL_TRANSACTIONS: Web3Transaction[] = [
  {
    id: 'tx-101',
    type: 'BUY',
    marketTitle: '¿Bitcoin ($BTC) superará los $100k?',
    outcome: 'YES',
    shares: 1689.18,
    amountUsd: 1148.64,
    txHash: '0x9a8f3b21c4e7...881f',
    timestamp: 'Hoy, 09:15',
    status: 'confirmed',
    blockNumber: 21849102,
    gasFeeUsd: 0.08
  },
  {
    id: 'tx-102',
    type: 'BUY',
    marketTitle: '¿FED recortará tasas ≥25 bps?',
    outcome: 'YES',
    shares: 3658.53,
    amountUsd: 2743.90,
    txHash: '0x12c4e889f01a...bb42',
    timestamp: 'Ayer, 14:20',
    status: 'confirmed',
    blockNumber: 21841029,
    gasFeeUsd: 0.07
  },
  {
    id: 'tx-103',
    type: 'FAUCET',
    amountUsd: 10000.00,
    txHash: '0xffee4421aa00...77bc',
    timestamp: '22 Ago, 10:00',
    status: 'confirmed',
    blockNumber: 21832001,
    gasFeeUsd: 0.02
  }
];
