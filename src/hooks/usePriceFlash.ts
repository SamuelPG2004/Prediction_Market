import { useEffect, useRef, useState } from 'react'

/**
 * Dirección del último cambio de precio, visible durante un instante: 'up' si
 * la cuota subió, 'down' si bajó, null en reposo. Hace perceptible el
 * refresco en vivo: sin esto, un precio que cambia bajo el cursor pasa
 * desapercibido.
 *
 * Aparecer o desaparecer la cotización (null ↔ número) no destella: eso ya lo
 * comunica el propio botón al pasar de raya a cuota.
 */
export function usePriceFlash(
  price: number | null,
  durationMs = 1600,
): 'up' | 'down' | null {
  const prev = useRef(price)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    const before = prev.current
    prev.current = price
    if (price === null || before === null || price === before) return
    setFlash(price > before ? 'up' : 'down')
    const t = window.setTimeout(() => setFlash(null), durationMs)
    return () => window.clearTimeout(t)
  }, [price, durationMs])

  return flash
}
