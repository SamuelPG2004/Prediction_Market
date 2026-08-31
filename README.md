# Aether Markets

Terminal de mercados de predicción **reales**. Deportes sobre
[Azuro](https://azuro.org) (Polygon, USDT) y el resto de categorías sobre
[Limitless](https://limitless.exchange) (Base, USDC), detrás de una
arquitectura de puertos y adaptadores donde la UI no conoce ningún protocolo.

![status](https://img.shields.io/badge/estado-funcionando-brightgreen)

> **Aquí hay dinero real.** Cada apuesta firma una orden con tu wallet y mueve
> fondos de verdad. No hay modo práctica.

## Qué hace

- **Navega mercados reales** por categoría; Deportes se subdivide por deporte
  y muestra enfrentamientos con sus cuotas por liga, más los partidos
  destacados por volumen apostado.
- **Cotizaciones ejecutables**, no puntos medios: el order book real en
  Limitless (con impacto en precio) y la cuota firmada del vAMM en Azuro.
- **Boleto de apuestas**: simples en tanda para cualquier venue y combinadas
  con las selecciones de Azuro.
- **Mis posiciones**: consulta lo apostado en ambos venues y cobra los
  premios de Azuro ya resueltos.
- **Puente de fondos** entre redes (Polygon · Base · BNB Chain) con el widget
  de LI.FI, sin salir de la app.
- **Wallet**: cualquier extensión instalada (detección EIP-6963) o wallets
  móviles por QR vía WalletConnect.

## Empezar

```bash
npm install
```

Crea un `.env.local` con las variables que necesites (ver abajo) y arranca:

```bash
npm run dev
```

Abre http://localhost:3000. Sin variables de entorno la app funciona en solo
lectura: lista mercados y cotiza, pero no ofrece apostar.

## Configuración

Todas las variables van en `.env.local` y son opcionales; cada una desbloquea
una capacidad concreta.

| Variable                                                    | Desbloquea                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `VITE_AZURO_AFFILIATE_ADDRESS`                               | Apostar en Azuro (dirección de afiliado que exige su relayer)     |
| `VITE_LIMITLESS_API_TOKEN_ID` / `..._API_TOKEN_SECRET`       | Apostar en Limitless (par de token API, firma HMAC; van juntas)   |
| `VITE_WALLETCONNECT_PROJECT_ID`                              | Wallets móviles por QR (projectId gratuito de cloud.reown.com)    |
| `VITE_POLYGON_RPC_URL` / `VITE_BASE_RPC_URL` / `VITE_BSC_RPC_URL` | RPCs propios (van primero; hay públicos de respaldo)         |
| `VITE_AZURO_CHAIN_ID`                                        | Otra red de Azuro (por defecto Polygon, 137)                      |
| `VITE_LIMITLESS_INCLUDE_SPORTS`                              | `true` para listar también deportes en Limitless                  |
| `VITE_LIMITLESS_API_URL`                                     | Otra base para la API de Limitless (por defecto, el proxy local)  |

> **Este build es para uso personal.** Todo lo que empieza por `VITE_` se
> incrusta en el JavaScript del bundle, incluido el secreto del token de
> Limitless. No publiques un build con tus credenciales: para desplegar en
> serio, la firma HMAC debería moverse a un backend.

**CORS de Limitless**: su API solo responde a sus propios orígenes, así que el
navegador pasa por el proxy same-origin `/api/limitless` (configurado en
`vite.config.ts` para dev y preview). Si sirves el build con otro host,
necesita un reverse proxy equivalente.

## Comandos

| Comando           | Qué hace                                        |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo                          |
| `npm run build`   | Build de producción en `dist/`                  |
| `npm run preview` | Sirve el build (con el proxy de Limitless)      |
| `npm run lint`    | Comprueba tipos (`tsc --noEmit`)                |
| `npm test`        | Tests con vitest, sin red (fixtures reales)     |

## Arquitectura

Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md): el puerto `MarketSource`,
los dos adaptadores, las reglas no negociables y cómo se capturan los
fixtures de test. El proyecto empezó como mercado de práctica con datos de
Polymarket; esa etapa se eliminó por completo en la Fase 4.
