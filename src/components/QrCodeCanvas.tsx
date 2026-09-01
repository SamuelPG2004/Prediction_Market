import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

/**
 * QR de un texto (aquí, la dirección de depósito). Fondo blanco a propósito:
 * los lectores de las apps de exchange esperan módulos oscuros sobre claro.
 */
export const QrCodeCanvas: React.FC<{ value: string; size?: number }> = ({
  value,
  size = 168,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current === null) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: '#090b0f', light: '#ffffff' },
    }).catch(() => {
      // Sin QR no se pierde nada: la dirección copiable sigue visible al lado.
    });
  }, [value, size]);

  return <canvas ref={canvasRef} className="rounded-lg" width={size} height={size} />;
};
