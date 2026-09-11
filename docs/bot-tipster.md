# Bot tipster (IA sobre el catálogo de Azuro)

Dos endpoints serverless que le piden a Gemini que evalúe partidos de Azuro
**con el método de un tipster concreto** (sus transcripciones de video,
inyectadas en el system prompt) y devuelven picks listos para la dApp.
El frontend los pinta en la sección "Picks del tipster" de la portada, con
tres modos: picks automáticos, "yo elijo los partidos" y un chat para
preguntar por CUALQUIER partido del sportsbook.

El código compartido (catálogo de Azuro, system prompt, llamada a Gemini,
validación de picks) vive en `api/_tipster/nucleo.ts`.

## Cómo funciona, en una pasada

```
GET /api/tipster-bot            (los picks de la sección)
  1. Lee el perfil del tipster (api/_tipster/transcripciones.ts).
  2. Trae de Azuro los 15 prematch más apostados + hasta 10 mercados
     activos por partido, con sus cuotas (REST del Backend API).
     Con ?gameIds=a,b,c evalúa SOLO esos (modo "yo elijo").
  3. Se lo pasa a Gemini con el perfil como system prompt y un esquema
     JSON forzado: la IA extrae las reglas del tipster y elige (o NO
     elige: la lista vacía es respuesta válida).
  4. Valida cada pick contra el catálogo real: ids inexistentes fuera,
     y la cuota mostrada es SIEMPRE la de Azuro, nunca la del modelo.
  5. Cachea el resultado (TTL 15 min) y responde. Si una pasada falla
     (cuota de Gemini, Azuro caído), sirve la última buena aunque haya
     caducado: mejor picks viejos que una sección que desaparece.

POST /api/tipster-chat          (el chat de pronósticos)
  1. Recibe { gameId, pregunta? } — un único partido, el que el usuario
     buscó en la dApp (cualquiera del catálogo, no solo los populares).
  2. Pasa el control de cupo (abajo) y trae de Azuro ese partido con
     sus mercados y cuotas.
  3. Si es fútbol, raspa la forma reciente de ambos equipos (partidos
     jugados con marcadores) de TheSportsDB, datos públicos
     (api/_tipster/futbol.ts; caché 6 h por equipo). Sofascore devuelve
     403 a IPs de datacenter y Flashscore exige JS: por eso esta fuente.
     OJO: la clave de demostración "123" solo devuelve el ÚLTIMO partido;
     con THESPORTSDB_KEY propia en Vercel devuelve los últimos 5.
  4. Gemini responde { respuesta, picks } con el método del tipster; los
     picks se validan contra el catálogo igual que en la pasada normal.
```

El frontend (`src/components/TipsterPicks.tsx`) llama a `/api/tipster-bot` al
cargar: si responde, pinta la sección; si responde 503 (sin configurar)
desaparece entera. Un fallo transitorio se reintenta una vez a los 6 s. En
dev local los `/api/tipster-*` se reenvían por proxy de Vite al despliegue de
producción (ver `vite.config.ts`), así que la sección también existe en local
sin configurar nada. "Ver mercado" abre el panel de apuesta con el resultado
preseleccionado — **el bot nunca apuesta**: firmar es siempre un acto humano.

El chat vive en un componente compartido (`src/components/TipsterChat.tsx`,
con la tarjeta de pick y su parser) montado en dos sitios:

- El modo "Preguntar" de la sección de portada (buscando cualquier partido).
- Una sección plegable "Consejo del tipster (IA)" dentro del panel de apuesta
  (`TradePanel`) de cada evento del sportsbook: el usuario pregunta por EL
  partido abierto y los picks preseleccionan mercado y resultado ahí mismo
  ("Usar esta selección"). Plegada por defecto porque cada consulta gasta
  cupo; solo en eventos de Azuro con id de juego nativo.

## Cupo del chat (tier gratuito de Gemini)

El chat gasta una llamada de Gemini por pregunta, así que
`api/_tipster/limites.ts` corta ANTES de llamar:

- **10 consultas por hora por IP** y **120 al día en total** (todas las IPs),
  dejando margen a la pasada automática (≤96/día con su caché de 15 min)
  dentro de las ~250/día del tier gratuito de flash.
- El pronóstico GENERAL de un partido (sin pregunta) se cachea **1 hora** y
  lo comparten todos los usuarios que abran ese partido; las preguntas
  libres se cachean 10 min. Además el frontend sondea con
  `{ soloCache: true }` al abrir el chat: si el pronóstico ya está calculado
  aparece solo, gratis — la sonda jamás llama a la IA. (La caché vive en la
  instancia de la función: un redeploy o una instancia fría empiezan vacías;
  si algún día se quiere caché firme, el paso es un KV externo.)
- 429 con `motivo` y `reintentarEnSegundos`; la UI lo muestra tal cual.
- Es un limitador en memoria por instancia: aproximado a propósito. Si algún
  día hay abuso real, el paso siguiente es un KV externo, no afinar esto.

## Encenderlo (dos pasos)

1. **Transcripciones**: pega en `api/_tipster/transcripciones.ts` la
   transcripción de 1-2 videos del tipster (YouTube → "..." → "Mostrar
   transcripción", copiar tal cual). Ahí mismo puedes añadir `REGLAS_EXTRA`
   tuyas (límites de cuota, ligas vetadas…), que tienen prioridad.
2. **Clave de Gemini**: crea una gratis en https://aistudio.google.com/apikey
   y ponla en Vercel como `GEMINI_API_KEY` (Settings → Environment
   Variables). SIN prefijo `VITE_` (todo `VITE_` acaba en el bundle público).

Opcionales: `TIPSTER_BOT_SPORT` (p. ej. `football`, para acotar al terreno
del tipster), `TIPSTER_BOT_MODEL` (por defecto `gemini-3.6-flash`),
`TIPSTER_BOT_TTL_MIN` (caché, por defecto 15).

## Qué devuelve

```json
{
  "generatedAt": "…", "modelo": "gemini-3.6-flash",
  "partidosEvaluados": 15,
  "picks": [{
    "marketId": "azuro:<gameId>/<conditionId>",  ← formato del dominio
    "outcomeId": "…", "partido": "…", "mercado": "Total Goals",
    "resultado": "Over (2.5)", "cuota": 1.87,
    "stakeUnits": 2, "confianza": 0.7,
    "regla": "cita textual de la regla del tipster",
    "razon": "por qué este partido la cumple"
  }],
  "descartadosPorInvalidos": 0,
  "aviso": "…no es consejo financiero…"
}
```

## Límites honestos (leer antes de fiarse)

- El bot **solo ve equipos, ligas y cuotas**. Reglas del tipster que
  dependan de forma, lesiones o alineaciones no puede verificarlas (el
  prompt le obliga a reconocerlo bajando confianza o descartando).
- Las cuotas de Azuro ya llevan margen: nadie encuentra "valor" mirando
  solo la cuota. Un LLM suena convincente pero **no está calibrado**: la
  `confianza` es una opinión, no una probabilidad.
- Úsalo como filtro explicable, no como bot rentable. Antes de apostarle
  dinero: guarda las respuestas unas semanas y mide el ROI en papel.
- Tier gratuito de Gemini: con la caché de 15 min la pasada automática son
  ≤96 llamadas/día, y el chat va acotado por su propio cupo (arriba);
  transcripciones enormes (>150k caracteres) pueden rozar el límite de
  tokens/minuto.
- La forma raspada solo trae resultados y marcadores (no lesiones ni
  alineaciones), y el nombre de Azuro no siempre casa con el de la fuente:
  cuando no casa, el prompt le dice al modelo que NO hay datos y que no los
  invente.

## Operación

- Sin clave o sin transcripciones → 503 con `motivo` (y la sección del
  frontend no aparece). Error de Azuro/Gemini → 502 con `detalle`.
- La caché vive en la instancia de la función: un redeploy la vacía.
- Los archivos bajo `api/_tipster/` NO son rutas (guion bajo = ignorado
  por Vercel); las transcripciones nunca se sirven al público.
