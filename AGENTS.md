# Notas para agentes de IA

## Qué es esto

Un terminal de mercados de predicción **reales** sobre Azuro (deportes,
Polygon, USDT) y Limitless (resto, Base, USDC), con arquitectura de puertos y
adaptadores. **Cada apuesta firma órdenes y transacciones con fondos reales.**
Ver `docs/ARQUITECTURA.md` antes de tocar nada.

## Reglas al modificar este proyecto

1. **Hay dinero real.** Cualquier cambio en la ruta de apuesta (cotización,
   slippage, allowances, firma, envío de órdenes) se trata como código
   crítico: cambios mínimos, tests, y nunca una operación que el usuario no
   haya iniciado explícitamente en la UI.
2. **La UI no conoce venues.** Ningún componente importa tipos, campos ni
   endpoints de `src/adapters/`; el único punto de composición es
   `src/services/marketSources.ts`. Añadir un venue = un adaptador nuevo +
   una línea ahí, cero cambios en la UI.
3. **Toda respuesta externa se valida como `unknown`** en el `validate.ts` del
   adaptador antes de mapear. Los tipos de un SDK no son garantía: ambas APIs
   reales se desvían de su propia documentación.
4. **Errores como `Result<T>` con `VenueError`**, nunca excepciones hacia la
   UI. Sin cotización ⇒ `probability: null`, jamás 0%.
5. **No inventes ABIs ni direcciones de contrato.** Un intento anterior
   declaró una función inexistente y una dirección truncada. Verifica contra
   el explorador antes de escribir cualquier dirección.
6. **`import.meta.env` debe aparecer literal** en el módulo que lo lee: Vite
   solo inyecta las variables sobre esa expresión exacta; aliasearla o
   envolverla la rompe. Ver el comentario en `src/adapters/azuro/config.ts`.
7. **No subas `viem` de 2.55.19**: 2.56.0 elimina `./tempo/zones` y rompe
   `@wagmi/core`. Está anclado a propósito en `package.json`.
8. **Comprueba antes de dar algo por terminado:** `npm run lint` y `npm test`
   deben pasar limpios.

## Trampas del entorno

- El proyecto vive dentro de OneDrive: las cachés van fuera del árbol
  sincronizado (ver `cacheDir` en `vite.config.ts`). No añadas herramientas
  que escriban cachés en el repo.
- La API de Limitless tiene allowlist de CORS: en el navegador se llama vía
  el proxy `/api/limitless` (dev y preview), nunca directo.

## Verificación

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

Los tests corren sin red, contra fixtures reales capturados con
`scripts/dump-*-fixtures.mjs`; si cambias un mapper o `validate.ts`,
actualiza o recaptura los fixtures en lugar de retocarlos a mano.

Para probar en vivo: `npm run dev`, conectar wallet, comprobar que los
mercados cotizan y que el boleto calcula bien — **sin llegar a firmar** salvo
que el usuario lo pida.
