export type MarketCategory = 'All' | 'Crypto' | 'Macro' | 'AI & Tech' | 'Geopolitics' | 'Sports' | 'Private';

export type MarketStatus = 'active' | 'resolving' | 'resolved' | 'disputed';

export type OutcomeType = 'YES' | 'NO';

export interface SparklinePoint {
  date: string;
  yesProbability: number;
}

export interface PredictionMarket {
  id: string;
  title: string;
  description: string;
  category: MarketCategory;
  resolutionDate: string;
  resolutionSource: string; // e.g. "Chainlink Oracle / CoinGecko", "UMA Optimistic Oracle", "Federal Reserve Release", "Syndicate Multisig"
  yesProbability: number; // 0 to 100 (e.g. 72 means 72%)
  noProbability: number; // 0 to 100 (e.g. 28 means 28%)
  yesPriceUsd: number; // e.g. 0.72
  noPriceUsd: number; // e.g. 0.28
  volume24hUsd: number;
  totalLiquidityUsd: number;
  iconName: string;
  badge?: string;
  isPrivate?: boolean;
  privateAccessCode?: string;
  creatorAddress?: string;
  status: MarketStatus;
  resolvedOutcome?: OutcomeType;
  rules: string[];
  sparkline: number[]; // array of percentages e.g. [58, 62, 60, 68, 70, 72]
  recentTrades?: {
    type: OutcomeType;
    amountUsd: number;
    shares: number;
    timestamp: string;
    wallet: string;
  }[];
  // Blockchain-specific fields for Polymarket integration
  conditionId?: string;
  clobTokenIds?: string[];
  questionId?: string;
  oracle?: string;
  outcomeSlotCount?: number;
}

export interface UserPosition {
  id: string;
  marketId: string;
  marketTitle: string;
  category: MarketCategory;
  outcome: OutcomeType;
  sharesCount: number;
  avgPricePaidUsd: number;
  totalCostUsd: number;
  currentPriceUsd: number;
  currentValueUsd: number;
  pnlUsd: number;
  pnlPercentage: number;
  timestamp: string;
}

export type TransactionType = 'BUY' | 'SELL' | 'CLAIM_REWARD' | 'FAUCET' | 'CREATE_MARKET';

export interface Web3Transaction {
  id: string;
  type: TransactionType;
  marketTitle?: string;
  outcome?: OutcomeType;
  shares?: number;
  amountUsd: number;
  txHash: string;
  timestamp: string;
  status: 'confirmed' | 'pending' | 'failed';
  blockNumber: number;
  gasFeeUsd: number;
}

export interface SupportedNetwork {
  id: number;
  name: string;
  shortName: string;
  icon: string;
  rpcUrl: string;
  explorerUrl: string;
  currency: string;
  isTestnet?: boolean;
}

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  ensName: string | null;
  network: SupportedNetwork;
  usdcBalance: number;
  ethBalance: number;
  walletProvider: string | null;
}
