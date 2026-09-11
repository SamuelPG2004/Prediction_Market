/**
 * PERFIL DEL TIPSTER: las transcripciones de sus videos, que se inyectan en
 * el system prompt de Gemini para que el bot evalúe los partidos con SU
 * método (ver api/tipster-bot.ts).
 *
 * La carpeta empieza por "_" a propósito: Vercel no convierte en endpoint los
 * archivos de api/ que empiezan por guion bajo, así que esto es solo un
 * módulo del bot, no una ruta pública.
 *
 * CÓMO AÑADIR OTRO VIDEO:
 *  1. Abre el video del tipster en YouTube → "..." → "Mostrar transcripción"
 *     (o usa cualquier herramienta de transcripción si es de otra fuente).
 *  2. Copia el texto completo y pégalo como `transcripcion`, tal cual — con
 *     muletillas, marcas de tiempo y todo: limpiarlo no mejora nada y puede
 *     perder matices.
 *  3. Con 1-2 videos basta; más de ~150k caracteres en total empieza a
 *     comerse la ventana del modelo.
 *
 * OJO: el prompt le ordena al modelo EXTRAER las reglas operativas del
 * tipster, no copiar sus picks — un video de picks de un día concreto (como
 * el actual) sirve como muestra del método, y sus partidos, ya caducados, no
 * deben reaparecer como picks.
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
    titulo:
      'Pronósticos para el domingo 6 de septiembre (14 selecciones comentadas)',
    transcripcion: `0:00 Bienvenidos amigos nuevamente a un nuevo
0:03 video. En esta ocasión para el día de
0:05 mañana, domingo 6 de septiembre, tenemos
0:09 por delante un domingo espectacular
0:12 compartido de diferentes ligas y sobre
0:14 todo una jornada cargada de
0:17 oportunidades.
0:19 No hemos dejado video en lo que es MLS,
0:23 no llegamos a la meta. Lastimosamente
0:26 eh se hizo un reto de 50 comentarios.
0:30 Nadie prácticamente
0:32 en esas 6 horas pudo comentar y se
0:35 entiende, se comprende. Quizás muchos
0:37 ganaron el día de ayer, se fueron de
0:39 fiesta y todo lo demás y quizás se les
0:41 pasó [música] esas 6 horas. Entonces
0:45 para este domingo hemos preparado una
0:48 selección de 14 pronósticos, pero en
0:51 esta ocasión igual vamos a estar
0:53 analizando cada encuentro. con calma.
0:56 Son 14 opciones que tenemos. Vamos a
0:59 hablar del partido, de qué podemos
1:02 esperar, de dónde veo la oportunidad y
1:05 después entonces de esos análisis les
1:07 voy a dejar claro qué pronóstico y qué
1:11 cuota tiene lo que dejamos. Así que
1:15 igualmente en la descripción de este
1:17 mismo video estamos dejando cómo puedes
1:20 acceder a las distintas redes sociales,
1:24 ya sea si quieres ir a lo que es el
1:27 canal Free, al canal Bit, contactarnos.
1:30 Igual lo puedes hacer en la descripción
1:33 de este mismo video, está todo
1:35 detallado. Sin más, entonces, vamos a
1:37 revisar cómo nos fue el día de hoy en
1:39 YouTube. Eh, se han quedado algunas
1:42 opciones, la mayoría sea cierta,
1:45 inclusive eh unos unas jugadas bastante
1:49 buenas, cuotas para jugadas
1:51 individuales, bastante positivo el día
1:54 de hoy. Considero de que eh lo podemos
1:56 calificar muy bien el día de hoy. Así
1:59 que los partidos han sido un poquito
2:02 trágicos también algunos principales
2:04 como el Bayern Munich menciona el
2:07 Manchester City ganó 1 a0. Eh, partidos
2:11 que uno diría que se esperaría goleada
2:14 al final. Eh, sí que también me sacó
2:17 algunas jugadas estos estos días tan
2:20 temprano,
2:22 pero bueno, hay que seguir. Hemos
2:24 acertado remates, cuota 1.87
2:28 en Roma y Villarreal, que al final, como
2:30 vemos, se acierta, termina ganando el
2:34 equipo de la Roma. Eh, se esperaba, era
2:36 lo ideal que ganara, pero bueno, empezó
2:39 perdiendo. Al final remonta. Vamos a
2:42 comenzar directamente con la jornada del
2:45 día de mañana. El video para que no se
2:46 nos haga tan largo. Tenemos herenber
2:52 Almar. Comenzamos en Países Bajos con un
2:56 partido que me parece interesante por el
2:59 perfil de ambos equipos cuando estos dos
3:02 se enfrentan. Tenemos dos conjuntos que
3:04 pueden generar peligro eh igual en
3:09 ataque y tienen igual los dos argumentos
3:12 suficientes para encontrar espacios
3:15 durante lo que son los 90 minutos. No
3:17 estamos buscando aquí adivinar cuál de
3:20 los dos va a ganar. Es partido de
3:22 fútbol. El partido puede tener
3:25 diferentes escenarios. Aquí lo que
3:27 realmente me interesa es que ambos
3:29 tengan oportunidades de marcar. Si el
3:32 encuentro se vuelve igual, dinámico, con
3:34 transiciones, llegada de los dos lados,
3:37 el mercado que estamos buscando toma
3:39 mucho sentido aquí. Por eso prefiero
3:42 alejarnos de quién va a ganar y
3:44 concentrarnos directamente [música]
3:46 en la producción ofensiva de ambos
3:49 equipos. Equipos que vienen, como vemos,
3:52 Herenb haciendo goles y el visitante
3:55 igualmente marcando. Por ende vamos con
3:58 el pronóstico de ambos equipos marcan
4:01 cuota 1.44.
4:04 Ambos equipos marcan cuota 1.44.
4:09 Siguiente partido, siguiente encuentro,
4:11 el segundo nos vamos a Inglaterra para
4:13 uno de esos partidos que siempre llaman
4:16 muchísimo la atención, como lo es el
4:19 Everton versus Manchester United.
4:23 Ofrecen igual un encuentro bastante
4:25 intenso. Esperemos que lo hagan, pero
4:28 aquí no quiero complicarme buscando
4:30 tampoco ganador. La selección que hemos
4:34 elegido está enfocada completamente en
4:36 la cantidad de goles y el escenario que
4:39 estamos buscando permite que haya
4:41 actividad ofensiva, pero sin necesidad
4:43 de que el partido termine convertido
4:45 tampoco en una goleada. Incluso con tres
4:49 goles tendríamos margen favorable para
4:52 nuestra selección. Por eso me parece un
4:54 mercado bastante interesante para una
4:56 combinada, porque igual tenemos
4:58 diferentes resultados que todavía nos
5:01 pueden dar el acierto. El pronóstico
5:03 aquí viendo los últimos enfrentamientos
5:06 entre Everton y el equipo de Manchester
5:09 United 01, [música]
5:11 eh, hubo un 2-2, pero si vemos en casa
5:16 del Everton, menos de cuatro goles aquí
5:20 no han pasado. Por ende, considero de
5:22 que puede ser una selección bastante
5:24 positiva. Cuota 1.50, menos de cuatro
5:26 goles, cuota 1. 50. Me quedo con ese
5:32 pronóstico en Everton versus Manchester
5:36 United. Seguimos entonces con el fútbol
5:41 danés. esta liga. Eh, voy a estar
5:44 siguiendo al Copenhage. Aquí tenemos
5:46 entonces que se enfrenta versus Odense.
5:50 La lectura que hago es favorable al
5:51 conjunto visitante, pero en vez de
5:54 exigir que el Copenhague gane el partido
5:57 completo, vamos a utilizar un mercado
6:00 que nos ofrece mayor protección. Lo que
6:03 necesitamos es que Copenhague consiga
6:04 imponerse en una de las dos mitades.
6:07 Puede ser durante los primeros 45
6:09 minutos o puede ser en la segunda parte.
6:12 Eso igual nos da una ventaja importante
6:15 porque no dependemos de que el equipo
6:17 del Copenhague domine todo el encuentro.
6:20 Incluso si el equipo del Odense consigue
6:23 complicar una parte del partido, todavía
6:25 igualmente va a existir eh otra mitad
6:28 para que nuestra selección se cumpla.
6:31 Pronóstico Copenhage a ganar cualquier
6:34 mitad, cuota 1.44.
6:37 Copenhague a ganar cualquier mitad,
6:39 cuota 1.44.
6:43 Siguiente encuentro.
6:45 Vamos a llegar, vamos a pasar a uno de
6:48 los grandes encuentros del domingo para
6:51 los fanáticos del equipo del Barcelona,
6:54 Valencia contra Barcelona. Aquí tenemos
6:58 dos mercados diferentes y ambos están
7:01 relacionados con una misma lectura.
7:04 Esperamos que Barcelona tenga bastante
7:06 protagonismo ofensivo. La primera opción
7:09 tiene que ver con los corners. Cuando
7:11 Barcelona consigue instalarse durante
7:14 mucho tiempo en el campo rival, las
7:16 llegadas,
7:18 igualmente los centros, los disparos,
7:20 los bloqueos pueden terminar acumulando
7:23 tiros de esquina. Por eso la línea de
7:26 corner me parece bastante interesante y
7:28 la segunda selección está enfocada
7:31 directamente a los goles. Si el partido
7:34 se vuelve abierto y el Barcelona logra
7:37 llegar eh o llevar igualmente su fútbol
7:41 ofensivo y marcar, entonces podemos
7:44 tener un encuentro con tres o más goles
7:48 y son dos mercados distintos, pero ambos
7:51 parten
7:54 Barcelona igualmente debe tener lo que
7:56 es el peso ofensivo [música] en el
7:59 encuentro. Eh, un equipo del Valencia
8:02 que no ha venido para nada bien. Si
8:04 vemos eh la pantalla mucho rojo, si
8:08 vemos el Barcelona eh ha estado haciendo
8:12 cinco goles de visita [música] en sus
8:15 dos últimos partidos. Los dos
8:17 pronósticos. El primer pronóstico,
8:19 Barcelona más de 4.5 corner, cuota 1.40
8:23 y el segundo pronóstico más de 2.5
8:26 goles, cota 1.36, 2.5 goles y más de 4.5
8:33 corner para el Barcelona cuota 1.40,
8:36 cuota 1.36, dos opciones que me gustan.
8:39 Vamos a pasar a otro
8:42 encuentro, esta vez el quinto. Pasamos.
8:47 a Suiza. Vamos a viajar ahora a Suiza.
8:51 Basilea versus
8:55 o frente a Lugano. Es uno de esos
8:58 partidos en lo que donde me interesa más
9:01 es la capacidad de ambos equipos para
9:04 participar en el en el marcador, que
9:07 igual intentar determinar quién se queda
9:09 con los tres puntos. Son dos equipos
9:12 punteros, eh cualquiero puede ganar. Así
9:15 que el mercado de ambos marcas nos da
9:17 precisamente esa posibilidad de buscar
9:21 goles. Igual si Basilea encuentra lo que
9:24 es el gol y Lugo responde, tenemos
9:26 entonces [música] esa selección de ambos
9:29 marcan que ha salido y no necesitamos
9:31 que ninguno de los dos domine
9:32 completamente [música] el encuentro y es
9:35 un encuentro donde los dos eh van
9:38 [música] a tener igual fase ofensiva, un
9:40 gol de cada equipo igual puede llegar
9:43 incluso con relativa rapidez y cambiar
9:46 por completo lo que es el plantamiento
9:48 de cada uno de estos dos equipos. Por
9:50 eso considero que es una opción
9:52 interesante para nuestra jornada. El
9:55 ambos equipos marcan 4.50.
9:58 Luego bastante probable viendo de que
10:00 Lugano es el favorito, me quedo con ese
10:03 pronóstico. Ambos equipos marcan cuota
10:06 1.50.
10:09 Aquí mismo nos quedamos eh para el
10:11 enfrentamiento entre Sion y Tun, dos
10:13 equipos en el cual en papel eh deberían
10:17 estar en en la punta de la
10:19 clasificación.
10:20 Eh, aquí eh vamos a estar utilizando el
10:24 mercado de ganar cualquier mitad porque
10:27 considero que tiene más sentido que
10:30 exigir una victoria final. Si solamente
10:34 necesita encontrar una fase del partido
10:37 en la que consiguen ponerse. Puede ser
10:39 una primera parte donde toma el control
10:42 o una segunda parte
10:45 donde encuentre los espacios necesarios.
10:47 Eh, igualmente para marcar la
10:50 diferencia. Este tipo de selección igual
10:53 eh de lo que es gana cualquier mitad nos
10:56 permite tener mayor margen o o
11:01 no tener tanto margen de error con un
11:06 con un triunfo directo o no arriesgar.
11:09 Deás, viendo de que inclusive hay
11:12 jugadas como una roja que puede cambiar
11:15 [música] inclusive todo lo que es el
11:17 panorama del partido. Igualmente por eso
11:21 considero bastante interesante para
11:23 combinar Sion gana cualquier mitad, cota
11:27 1.36
11:29 a [música] ganar cualquier mitad es el
11:32 pronóstico. Y pasamos
11:35 a
11:37 Bundesliga en Alemania. entran Frankfurt
11:42 contra Augusburgo. Vamos directamente al
11:45 mercado de goles. La selección requiere
11:48 tres tantos o más y considero que es un
11:50 escenario razonable para este
11:52 enfrentamiento. Si vemos las
11:54 estadísticas previas, sí que no ha
11:57 habido muchos goles, eh, pero si vemos
12:01 estando en casa del entran en Frankfurt
12:03 y es un equipo que ha estado inclusive
12:06 marcando gol, haciendo gol. Lo lo
12:08 interesante de este Over 2.5 es que no
12:13 importa quién consiga los goles, podemos
12:15 tener un 21, un 3-0 o cualquiera eh o
12:20 cualquier combinación que hayan tres
12:22 goles. Eso elimina una parte importante
12:25 del riesgo de escoger directamente a un
12:27 equipo. La clave será que el partido
12:29 igual tenga [música] suficiente
12:32 ritmo ofensivo y que las oportunidades
12:33 que aparece
12:35 igual terminen convirtiéndose en goles.
12:39 Así que el pronóstico que vamos a estar
12:41 dejando es 2.5 goles, cuota 1.44,
12:46 2.5 cinco goles y pasamos a
12:51 uno de los grandes, pero grandes
12:54 partido, uno de los grandes encuentros
12:57 en Inglaterra, Premier League, Arsenal
13:01 versus el equipo del Chelsea. Arsenal
13:05 contra Chelsea. Este es un encuentro
13:07 donde cualquiera de los dos puede
13:09 complicar al rival durante determinados
13:12 momentos. Por eso nuevamente me parece
13:14 más interesante utilizar el mercado de
13:17 una mitad. Arsenal no necesita ganar los
13:20 90 minutos, es favorito, solamente
13:23 necesita que o vamos a necesitar que eh
13:27 termine de ganar una de las dos partes
13:29 por encima del Chelsea. Eso significa
13:32 que incluso si tenemos una primera parte
13:34 muy equilibrada, todavía queda la
13:37 segunda mitad para que se cumpla lo que
13:38 es la selección. Es una apuesta que
13:41 personalmente prefiero antes que
13:43 lanzarme directamente con el triunfo o
13:46 con el ganador del Arsenal. El que dese
13:49 puede hacerlo. Eh, mi pronóstico aquí va
13:51 a ser Arsenal a ganar cualquier mitad.
13:55 Eh, cuota 1.36.
13:58 La victoria está en 167. Un equipo que
14:01 viene bien, su último enfrentamiento lo
14:03 ha estado ganando, pero me voy a quedar
14:05 con Arsenal a ganar cualquier mitad.
14:09 equipo eh que viene en invicto, duelo de
14:11 invicto. Bucayo, Saca versus Col Palmer,
14:15 eh un encuentro bastante bueno. Vámonos
14:18 entonces con ese pronóstico. Siguiente
14:22 encuentro que vamos a estar tocando va a
14:24 ser Lesposna versus el equipo de Raow en
14:30 Polonia. Aquí la Esposna. Eh, tenemos
14:35 otra selección basada en el mismo
14:37 concepto, eh, que el equipo
14:41 gane una de las dos mitades. Eh, eso
14:44 igual nos permite tener un partido mucho
14:46 más amplio en cuanto posibilidades. No
14:49 necesitamos igualmente que el Esposnia
14:52 gane. Si vemos ha estado bastante bien
14:55 en los últimos cuatro partidos. eh una
14:59 buena primera parte o inclusive si logra
15:03 perder la primera parte 2-0 y en el
15:07 segundo tiempo gana 1 a0 [música]
15:09 y queda el partido 2-1, significa que la
15:12 segunda parte la ganó y estaríamos
15:14 acertando el pronóstico. Pronóstico
15:17 aquí. Les Pochna ganará cualquier mitad,
15:20 cuota 1.33 que gane la primera o segunda
15:24 mitad. Vámonos con [música] ese
15:27 pronóstico en Bolonia.
15:30 Bolonia o Bologna versus Azuolo. Eh, me
15:34 quedo aquí un mercado bastante sencillo
15:36 de entender, no se los voy a explicar.
15:39 Necesitamos al menos dos goles durante
15:41 el encuentro, 1.5 goles. No necesitamos
15:45 elegir el ganador que va a ser Bolonia,
15:47 va a ser Sasuolo. Tampoco necesitamos
15:50 que un equipo haga ambos tanto, que el
15:52 Bolonia marque esos dos goles o que el
15:55 Sasulo marque esos dos goles. No nos
15:57 interesa un 1 a0, uno, eh, perdón, si
16:01 eso no nos interesa. Nos interesa un 1 a
16:04 un eh 20, 02, 21. Lo importante aquí es
16:10 que hagan más de dos goles y para una
16:13 combinada larga y o
16:17 una combinada interesante, el 1.5 goles
16:20 a cuota 1.33
16:22 funciona bastante bien. Se ha dado en
16:24 cuatro de sus cinco últimos partidos. Me
16:26 quedo con esa opción, 1.5
16:29 goles. Marsella versus el equipo de el
16:33 París. Nos vamos a Francia. Eh, aquí mi
16:37 lectura vuelve a estar del lado del
16:39 equipo local, pero eh utilizamos un
16:42 mercado que nos protege un poco más.
16:44 Marcella gana cualquier mitad, [música]
16:47 eso significa que igualmente que el
16:51 Marcella no necesita ganar el encuentro
16:53 con que gane primero o segundo tiempo.
16:57 Es lo importante. Buscamos eso cuando
16:59 utilizamos este mercado. Inclusive un
17:01 empate de final todavía puede
17:03 permitirnos cobrar si Marsella consiguió
17:06 ganar una de las dos mitades. Por eso me
17:09 parece más atractivo que el triunfo
17:11 directo en un partido en el cual si
17:14 vemos los enfrentamientos el último 5-2
17:17 eh, y luego eh 11, pero en [música] el
17:20 78 este equipo de Marcella viene eh
17:23 peleando puestos de arriba. Eh, cuatro
17:26 puntos, ¿no? Eh, perdón, tres puntos
17:29 tiene que ganar el siguiente. El París
17:32 siempre es un equipo que te va a
17:33 complicar, pero de visita no le ha ido
17:36 para nada bien. Por eso busco la mitad
17:38 que gane [música] cualquier mitad el
17:40 equipo de Marsella, cuota 1.44.
17:45 Pasamos aquí. Esta vez eh vamos a ir con
17:49 un mercado eh diferente, pero muy
17:52 interesante. Eh vamos a estar buscando
17:57 eh no vamos a estar buscando goles, no
17:59 vamos a estar buscando eh ganador, eh
18:03 vamos a estar buscando remates al arco,
18:05 pero eh vamos a estar buscando para el
18:08 Milan que necesita conseguir al menos
18:10 tres disparos entre los tres palos. Lo
18:13 que me gusta de este mercado es que no
18:15 necesitamos que el equipo igualmente
18:17 [música] convierta o que haga eh esos
18:20 tres goles, ¿no? Eh puede tener tres,
18:23 cuatro o cinco remates al arco y
18:26 perfectamente terminar el partido con un
18:28 solo gol o un 0 a0 [música] inclusive
18:30 perdiéndolo. Y considero que es un
18:33 partido importante. Igualmente Milan
18:36 consigue generar suficiente volumen
18:38 ofensivo, tres remates en los tres
18:40 palos, es una línea que puede
18:42 alcanzarse. Ya lo ha hecho
18:44 anteriormente. Eh, si vemos aquí, eh,
18:48 bueno, aquí hizo uno, pero de local de
18:52 visita ya le ha estado marcando. Aquí
18:54 hizo cuatro, [música] necesitamos tres.
18:57 Me quedó con más de 2.5
19:00 remates al arco para el equipo [música]
19:02 de el Milan. Me quedó con ese
19:04 pronóstico. Milan más de 2.5 remates al
19:08 arco. Un partido en Bolivia que me ha
19:12 gustado es eh el Independiente contra
19:17 Bolívar. Aquí volvemos
19:21 eh o necesitamos tres o más goles
19:25 durante lo que es el encuentro. La la
19:28 ventaja de este mercado es que no
19:29 necesitamos preocuparnos tampoco por
19:31 ganador superfavorito, el equipo de
19:35 Bolívar, pero ya saben que eh va de
19:38 visita. El Independiente ha venido muy
19:41 bien de local en sus dos últimos,
19:43 inclusive tres últimos encuentros. Lo
19:46 importante es que el marcador alcance
19:48 los tres tanto cuando estos dos equipos
19:52 [música]
19:52 se han enfrentado, 1 2 03 01 2 1 14
19:56 [música]
19:57 ha salido en cuatro de sus cinco últimos
20:00 encuentros. Por eso eh considera una
20:02 opción interesante a que eh se dé lo que
20:07 es el 2.5 goles cota 1.36
20:11 2.5
20:13 goles. Siguiente y último partido que
20:16 vamos a estar tocando eh o vamos a estar
20:19 cerrando en España, esta vez en español
20:24 versus el equipo del Sevilla.
20:27 La primera vamos a tener con dos
20:29 opciones igualmente aquí que es la
20:31 primera es que
20:34 el español equipo local que ha venido
20:36 marcando en sus cinco últimos partidos
20:39 pueda hacer su gol el día de mañana. Y
20:44 la segunda también tenemos esa selección
20:47 de 1.5 goles, que esto nos lleva a un
20:49 escenario donde esperamos al menos dos
20:52 goles en total. Igual eh son
20:55 combinaciones muy importantes,
20:57 combinaciones que van enlazada. El que
21:00 quiera puede buscar el gol del equipo
21:03 del español, cuota 1.33 y el 1.5 en
21:07 general, cuota 1.44.
21:09 Ambos marcan, no lo no lo descartaría.
21:12 Cuota dos. Me parece también bastante
21:14 interesante ese. Ambos marcan, pero
21:18 prefiero ir a lo seguro. Vámonos con
21:21 [música]
21:21 español marca gol y el 1.5
21:25 goles. Así que amigos, si te ha gustado
21:27 el video, no olvides dejar tu
21:29 comentario, dejar tu me [música] gusta,
21:31 suscribirte y sin más, solamente me
21:34 queda pedirte que compartas este video
21:36 con tus amistades. Sin más, desearte
21:39 suerte para el día de mañana.
21:40 Bendiciones, se me cuidan. Bye bye.`,
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
  'El video es de una jornada pasada: sus partidos concretos ya caducaron. Extrae el ESTILO (qué mercados usa, en qué rangos de cuota, qué evita) y aplícalo solo a los partidos del catálogo actual.',
]

/**
 * MÉTODO DESTILADO del tipster: el resumen operativo de las transcripciones
 * de arriba, para el CHAT (una consulta por pregunta de usuario). Enviar los
 * videos completos en cada mensaje quemaba ~40k tokens por consulta y agotó
 * el cupo diario gratuito de Gemini el 2026-09-10; esto pesa ~50 veces menos.
 * La pasada de portada (/api/tipster-bot, pocas al día gracias a su caché)
 * sigue usando las transcripciones íntegras.
 *
 * OJO: destilado a mano del video del 2026-09-06. Si pegas videos nuevos
 * arriba, vuelve a destilar este resumen (o déjalo vacío '' y el chat volverá
 * a usar las transcripciones completas).
 */
export const METODO_DESTILADO = `Método del tipster (destilado de sus videos):

FILOSOFÍA
- Solo fútbol, prematch. Casi nunca elige ganador del partido (1X2): "no estamos buscando adivinar quién va a ganar". Busca mercados con PROTECCIÓN/margen, pensados para jugadas individuales o combinadas.
- Rango de cuota preferido por selección: 1.33 a 1.50. Descarta opciones fuera de rango aunque le gusten ("prefiero ir a lo seguro").
- Si nada encaja, no se apuesta: no forzar entradas es parte del método.

MERCADOS QUE USA (por orden de frecuencia en sus videos)
1. GANA CUALQUIER MITAD del equipo con lectura favorable (cuota 1.33-1.44): no exige ganar los 90 minutos, basta imponerse en una de las dos mitades; lo prefiere siempre al triunfo directo del favorito.
2. TOTALES DE GOLES sin elegir ganador: Más de 2.5 (partidos con ritmo ofensivo, cuota 1.36-1.44), Más de 1.5 ("al menos dos goles", 1.33-1.44), y como protección Menos de 3.5/4.5 (margen incluso con tres goles, ~1.50).
3. AMBOS EQUIPOS MARCAN (1.44-1.50): cuando los dos generan peligro y vienen marcando; no exige dominador.
4. GOL DE UN EQUIPO CONCRETO (Over 0.5 goles del equipo, ~1.33): equipo local que viene marcando en sus últimos 4-5 partidos.
5. CORNERS de un equipo (p. ej. Más de 4.5, ~1.40): cuando un favorito se instala en campo rival y acumula llegadas.
6. REMATES A PUERTA de un equipo (p. ej. Más de 2.5, ~1.40-1.87): exige volumen ofensivo, no goles.

EN QUÉ SE FIJA PARA JUSTIFICAR
- Racha reciente de goles a favor/en contra (últimos 4-5 partidos) y si la línea elegida "ha salido en 4 de sus últimos 5".
- Historial de enfrentamientos directos (H2H) y marcadores en casa del local.
- Condición local/visitante ("de visita no le ha ido nada bien").
- Riesgos de partido (una roja cambia el panorama) como razón extra para mercados con margen.

STAKE
- Jugadas de 1 a 3 unidades; lo habitual son selecciones de combinada (stake bajo) y alguna individual clara (stake medio).`
