# Notas para agentes de IA

## Qué es esto

Un mercado de predicciones **personal**, que corre entero en el navegador.
No es un cliente de Polymarket. Ver `docs/ARQUITECTURA.md`.

## Reglas al modificar este proyecto

1. **No hay dinero real.** El saldo es de práctica y vive en `localStorage`.
   Si añades algo que sugiera fondos reales, etiquétalo con claridad.
2. **La wallet es solo identidad y lectura.** No introduzcas firma ni envío de
   transacciones sin que el usuario lo pida explícitamente.
3. **No inventes ABIs ni direcciones de contrato.** El intento anterior declaró
   una función `trade(uint256,uint256)` inexistente y una dirección truncada.
   Verifica contra el explorador antes de escribir cualquier dirección.
4. **El estado se toca solo desde `useMarketStore`.** Los componentes son
   presentacionales.
5. **Los updaters de `setState` deben ser puros.** No derives valores de retorno
   escribiendo a variables desde dentro de un updater: React no garantiza cuándo
   lo ejecuta y StrictMode lo invoca dos veces. Calcula antes, luego llama a
   `setState`.
6. **Comprueba tipos antes de dar algo por terminado:** `npm run lint` debe dar
   cero errores.

## Verificación

```bash
npm run lint
```

```bash
npm run build
```

Para probar el ciclo completo a mano: crear mercado → comprar → resolver →
comprobar que el saldo cuadra → recargar la página y comprobar que persiste.
