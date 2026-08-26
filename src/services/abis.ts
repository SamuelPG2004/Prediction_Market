/**
 * ABIs mínimas y REALES de los contratos con los que hablamos.
 *
 * Cada función de aquí existe en el contrato desplegado. No hay nada inventado.
 *
 * El código anterior de este proyecto declaraba `trade(uint256,uint256)` en el
 * CTFExchange. Esa función NO existe: en Polymarket no se compra llamando al
 * exchange, se firma una orden EIP-712 y el operador la liquida. Cualquier
 * orden enviada contra esa ABI habría revertido.
 */

/** ERC20, lo justo para saldo y aprobaciones. */
export const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/**
 * ConditionalTokens (ERC1155) + operaciones directas de posiciones.
 *
 * `splitPosition` / `mergePositions` / `redeemPositions` sí son transacciones
 * on-chain normales, sin CLOB de por medio:
 *   - split:  N USDC -> N shares de CADA resultado (un "set completo")
 *   - merge:  N shares de cada resultado -> N USDC
 *   - redeem: tras la resolución, shares ganadoras -> USDC
 */
export const CONDITIONAL_TOKENS_ABI = [
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'accounts', type: 'address[]' },
      { name: 'ids', type: 'uint256[]' },
    ],
    name: 'balanceOfBatch',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    name: 'getOutcomeSlotCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    name: 'payoutDenominator',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'partition', type: 'uint256[]' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'splitPosition',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'partition', type: 'uint256[]' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mergePositions',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'indexSets', type: 'uint256[]' },
    ],
    name: 'redeemPositions',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

/**
 * CTFExchange: solo lecturas de configuración.
 *
 * Son las funciones que se usaron para verificar las direcciones de
 * `config/polymarket.ts` contra la cadena.
 */
export const CTF_EXCHANGE_ABI = [
  {
    inputs: [],
    name: 'getCollateral',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getCtf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getComplement',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/** NegRiskAdapter: mismas operaciones de posiciones, con su propia interfaz. */
export const NEG_RISK_ADAPTER_ABI = [
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const
