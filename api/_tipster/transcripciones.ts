/**
 * PERFIL DEL TIPSTER: las transcripciones de sus videos, que se inyectan en
 * el system prompt de Gemini para que el bot evalúe los partidos con SU
 * método (ver api/tipster-bot.ts).
 *
 * La carpeta empieza por "_" a propósito: Vercel no convierte en endpoint los
 * archivos de api/ que empiezan por guion bajo, así que esto es solo un
 * módulo del bot, no una ruta pública.
 *
 * CÓMO RELLENARLO (el único paso manual):
 *  1. Abre el video del tipster en YouTube → "..." → "Mostrar transcripción"
 *     (o usa cualquier herramienta de transcripción si es de otra fuente).
 *  2. Copia el texto completo y pégalo como `transcripcion`, tal cual — con
 *     muletillas y todo: limpiarlo no mejora nada y puede perder matices.
 *  3. Repite para el segundo video si lo hay. Con 1-2 videos basta; más de
 *     ~150k caracteres en total empieza a comerse la ventana del modelo.
 *
 * Mientras las transcripciones sigan siendo el marcador de posición, el
 * endpoint responde 503 explicándolo, en vez de inventarse un método.
 */

export interface TranscripcionVideo {
  /** Título del video, para citarlo en el prompt ("según tu video X…"). */
  titulo: string
  /** Transcripción completa, pegada tal cual. */
  transcripcion: string
}

/** Marcador de posición: el endpoint lo detecta y se niega a operar con él. */
export const MARCADOR_PENDIENTE = 'PEGA_AQUI_LA_TRANSCRIPCION'

export const TRANSCRIPCIONES: TranscripcionVideo[] = [
  {
    titulo: 'PEGA_AQUI_EL_TITULO_DEL_VIDEO_1',
    transcripcion: MARCADOR_PENDIENTE,
  },
  // Segundo video (opcional): descomenta y pega.
  // {
  //   titulo: 'PEGA_AQUI_EL_TITULO_DEL_VIDEO_2',
  //   transcripcion: MARCADOR_PENDIENTE,
  // },
]

/**
 * Reglas adicionales tuyas, fuera de los videos (opcional): límites de cuota,
 * ligas vetadas, banca… Se añaden al perfil DESPUÉS de las transcripciones y
 * el prompt les da prioridad sobre lo dicho en los videos.
 */
export const REGLAS_EXTRA: string[] = [
  // 'Nunca proponer cuotas por debajo de 1.40 ni por encima de 3.50.',
]
