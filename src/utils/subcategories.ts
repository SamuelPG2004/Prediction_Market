/**
 * Presentación de subcategorías (deportes, principalmente): nombre en español
 * e icono. Solo presentación — el filtrado viaja siempre por `id`, y lo que no
 * esté aquí se muestra con el nombre que publica el venue.
 */

const LABELS_ES: Record<string, string> = {
  football: 'Fútbol',
  tennis: 'Tenis',
  basketball: 'Baloncesto',
  baseball: 'Béisbol',
  'ice-hockey': 'Hockey hielo',
  'american-football': 'Fútbol americano',
  boxing: 'Boxeo',
  mma: 'MMA',
  volleyball: 'Voleibol',
  'table-tennis': 'Tenis de mesa',
  cricket: 'Críquet',
  handball: 'Balonmano',
  'rugby-union': 'Rugby',
  'rugby-league': 'Rugby League',
  cs2: 'CS2',
  'dota-2': 'Dota 2',
  lol: 'LoL',
};

const ICONS: Record<string, string> = {
  football: '⚽',
  tennis: '🎾',
  basketball: '🏀',
  baseball: '⚾',
  'ice-hockey': '🏒',
  'american-football': '🏈',
  boxing: '🥊',
  mma: '🥋',
  volleyball: '🏐',
  'table-tennis': '🏓',
  cricket: '🏏',
  handball: '🤾',
  'rugby-union': '🏉',
  'rugby-league': '🏉',
  cs2: '🎮',
  'dota-2': '🎮',
  lol: '🎮',
};

/** Nombre en español de la subcategoría, o el que dé quien llama si no consta. */
export function subcategoryLabel(id: string, fallback?: string): string {
  return LABELS_ES[id] ?? fallback ?? id;
}

/** Icono de la subcategoría, o `null` si no hay uno asignado. */
export function subcategoryIcon(id: string): string | null {
  return ICONS[id] ?? null;
}
