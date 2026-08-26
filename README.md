# Aether Markets

Tu mercado de predicciones personal. Creas las preguntas, apuestas con saldo de
práctica, y tú decides el resultado. Todo se guarda en tu navegador.

![status](https://img.shields.io/badge/estado-funcionando-brightgreen)

## Qué hace

- **Creas tus mercados.** Cualquier pregunta de sí/no con fecha límite.
- **Apuestas con saldo de práctica.** Empiezas con $10.000 ficticios. El precio
  se mueve según el tamaño de tus órdenes.
- **Tú resuelves.** Cuando el evento ocurre, declaras el resultado: cada share
  ganadora paga $1 y las perdedoras $0. Tu saldo lo refleja.
- **Mercados privados.** Protegidos con código de acceso, verificado de verdad.
- **Persiste.** Todo vive en `localStorage`. Puedes exportar e importar un
  respaldo JSON.

## Empezar

```bash
npm install
```

```bash
npm run dev
```

Abre http://localhost:3000. No hace falta configurar nada ni conectar ninguna
wallet.

## Comandos

| Comando           | Qué hace                          |
| ----------------- | --------------------------------- |
| `npm run dev`     | Servidor de desarrollo            |
| `npm run build`   | Build de producción en `dist/`    |
| `npm run preview` | Sirve el build                    |
| `npm run lint`    | Comprueba tipos (`tsc --noEmit`)  |

## Sobre el dinero

**No hay dinero real en ningún punto de esta app.** El saldo es ficticio y sirve
para llevar la cuenta de tus predicciones.

Conectar una wallet es **opcional** y de alcance muy limitado: te da tu
dirección como identidad y lee tu saldo de USDC en Polygon en **solo lectura**.
La app nunca firma ni envía transacciones, y no toca ese saldo.

## Arquitectura

Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) para el diseño, el modelo de
precios y qué se descartó del intento anterior de integrar Polymarket.
