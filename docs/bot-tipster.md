# Bot tipster (IA sobre el catálogo de Azuro)

Un endpoint serverless que le pide a Gemini que evalúe los partidos actuales
de Azuro **con el método de un tipster concreto** (sus transcripciones de
video, inyectadas en el system prompt) y devuelve picks listos para la dApp.
El frontend los pinta en la sección "Picks del tipster" de la portada.

## Cómo funciona, en una pasada

```
GET /api/tipster-bot
  1. Lee el perfil del tipster (api/_tipster/transcripciones.ts).
  2. Trae de Azuro los 15 prematch más apostados + hasta 10 mercados
     activos por partido, con sus cuotas (REST del Backend API).
  3. Se lo pasa a Gemini con el perfil como system prompt y un esquema
     JSON forzado: la IA extrae las reglas del tipster y elige (o NO
     elige: la lista vacía es respuesta válida).
  4. Valida cada pick contra el catálogo real: ids inexistentes fuera,
     y la cuota mostrada es SIEMPRE la de Azuro, nunca la del modelo.
  5. Cachea el resultado (TTL 15 min) y responde.
```

El frontend (`src/components/TipsterPicks.tsx`) llama al endpoint al cargar:
si responde, pinta las tarjetas; si responde 503 (sin configurar) o no existe
(dev local), la sección desaparece entera. "Ver mercado" abre el panel de
apuesta con el resultado preseleccionado — **el bot nunca apuesta**: firmar
es siempre un acto humano.

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
- Tier gratuito de Gemini: con la caché de 15 min son ≤96 llamadas/día,
  de sobra; transcripciones enormes (>150k caracteres) pueden rozar el
  límite de tokens/minuto.

## Operación

- Sin clave o sin transcripciones → 503 con `motivo` (y la sección del
  frontend no aparece). Error de Azuro/Gemini → 502 con `detalle`.
- La caché vive en la instancia de la función: un redeploy la vacía.
- Los archivos bajo `api/_tipster/` NO son rutas (guion bajo = ignorado
  por Vercel); las transcripciones nunca se sirven al público.
