/**
 * Formatter and Calculation Utilities for Web3 Prediction Dashboard
 */

export function formatCurrency(amount: number, minimumFractionDigits: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  }).format(amount);
}

export function formatCompactNumber(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatPercent(value: number, includeSign: boolean = false): string {
  const formatted = `${value.toFixed(1)}%`;
  if (includeSign && value > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Fecha de un evento, en español y relativa cuando cae cerca:
 * "Hoy 21:00", "Mañana 12:30", "sáb 30 ago · 21:00".
 */
export function formatEventDate(date: Date): string {
  const time = date.toLocaleTimeString('es', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(date) - startOfDay(new Date())) / (24 * 60 * 60 * 1000),
  );

  if (dayDiff === 0) return `Hoy ${time}`;
  if (dayDiff === 1) return `Mañana ${time}`;

  const day = date.toLocaleDateString('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${day} · ${time}`;
}

/** Solo la hora ("21:00"): para filas que ya viven bajo una cabecera de día. */
export function formatEventTime(date: Date): string {
  return date.toLocaleTimeString('es', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
}

export function getTimeRemaining(isoDateString: string): { label: string; isUrgent: boolean } {
  try {
    const target = new Date(isoDateString).getTime();
    const now = new Date().getTime();
    const diff = target - now;

    if (diff <= 0) {
      return { label: 'Finalizado', isUrgent: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 30) {
      const months = Math.floor(days / 30);
      return { label: `${months}m restantes`, isUrgent: false };
    }
    if (days > 0) {
      return { label: `${days}d ${hours}h`, isUrgent: days < 3 };
    }
    if (hours > 0) {
      return { label: `${hours}h ${minutes}m`, isUrgent: true };
    }
    return { label: `${minutes}m restantes`, isUrgent: true };
  } catch {
    return { label: 'Próximamente', isUrgent: false };
  }
}

/**
 * Calculation of estimated shares based on investment and current price
 * In prediction markets like Polymarket:
 * 1 Share of winning outcome pays $1.00 USDC.
 * Cost per share = Probability price (e.g. $0.72)
 * Estimated shares = investmentUsd / pricePerShare
 * Potential payout = Estimated shares * $1.00
 * Net profit = Potential payout - investmentUsd
 * ROI = (Net profit / investmentUsd) * 100
 */
export function calculateTradeEstimates(investmentUsd: number, pricePerShare: number) {
  if (investmentUsd <= 0 || pricePerShare <= 0) {
    return {
      shares: 0,
      potentialPayoutUsd: 0,
      netProfitUsd: 0,
      roiPercentage: 0,
      priceImpactPercentage: 0.1,
    };
  }

  const shares = investmentUsd / pricePerShare;
  const potentialPayoutUsd = shares * 1.0;
  const netProfitUsd = potentialPayoutUsd - investmentUsd;
  const roiPercentage = (netProfitUsd / investmentUsd) * 100;
  
  // Simulated price impact based on trade size
  const priceImpactPercentage = Math.min(Math.max((investmentUsd / 50000) * 100, 0.05), 4.5);

  return {
    shares,
    potentialPayoutUsd,
    netProfitUsd,
    roiPercentage,
    priceImpactPercentage,
  };
}

export function generateMockTxHash(): string {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}
