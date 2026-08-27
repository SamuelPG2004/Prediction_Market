/**
 * Frontera del adaptador con el mundo exterior de Azuro.
 *
 * Todo lo que cruza la red (Backend API vía @azuro-org/toolkit) o la wallet
 * (viem) pasa por estas dos interfaces. El adaptador solo conoce la interfaz,
 * de modo que los tests inyectan una implementación falsa con fixtures y no
 * abren ni un socket.
 *
 * Los métodos de datos devuelven `unknown` a propósito: la respuesta externa
 * se valida SIEMPRE en `validate.ts` antes de mapearse al dominio, aunque el
 * toolkit declare tipos. (La API real ya se desvía de esos tipos: `margin`
 * llega como número y `category` como null.)
 */
import {
  GameState,
  createBet,
  getBetCalculation,
  getBetFee,
  getBetsByBettor,
  getConditionsByGameIds,
  getConditionsState,
  getGamesByFilters,
  getGamesByIds,
  searchGames,
  type BET_DATA_TYPES,
  type ChainId,
  type CreateBetParams,
} from '@azuro-org/toolkit'
import {
  erc20Abi,
  type Address,
  type Hex,
  type PublicClient,
  type SignTypedDataParameters,
  type WalletClient,
} from 'viem'
import type { AzuroChainId } from './config.ts'

export interface ListGamesParams {
  sportSlug?: string
  page: number
  perPage: number
}

export interface SearchGamesParams {
  query: string
  page: number
  perPage: number
}

/** Datos de solo lectura del Backend API de Azuro. */
export interface AzuroGateway {
  listGames(params: ListGamesParams): Promise<unknown>
  searchGames(params: SearchGamesParams): Promise<unknown>
  getGamesByIds(gameIds: string[]): Promise<unknown>
  getConditionsByGameIds(gameIds: string[]): Promise<unknown>
  getConditionsState(conditionIds: string[]): Promise<unknown>
  getBetCalculation(
    selection: { conditionId: string; outcomeId: string },
    account: Address | undefined,
  ): Promise<unknown>
  getBetFee(): Promise<unknown>
  getBetsByBettor(bettor: Address): Promise<unknown>
  submitBet(params: CreateBetParams): Promise<unknown>
}

export type BetTypedData = SignTypedDataParameters<typeof BET_DATA_TYPES>

/** Operaciones que exigen wallet. Separadas para poder operar sin ella. */
export interface AzuroWalletBridge {
  /** Allowance actual del token de apuesta hacia el relayer. */
  readAllowance(token: Address, owner: Address, spender: Address): Promise<bigint>
  /** Aprueba `amount` del token al relayer y espera la confirmación. */
  approve(token: Address, spender: Address, amount: bigint): Promise<void>
  /** Firma EIP-712 de la apuesta. */
  signBetTypedData(typedData: BetTypedData): Promise<Hex>
}

/** Implementación real contra el Backend API, vía el toolkit oficial. */
export function createAzuroGateway(chainId: AzuroChainId): AzuroGateway {
  const id = chainId as ChainId
  return {
    listGames: ({ sportSlug, page, perPage }) =>
      getGamesByFilters({
        chainId: id,
        state: GameState.Prematch,
        sportSlug,
        page,
        perPage,
      }),
    searchGames: ({ query, page, perPage }) =>
      searchGames({ chainId: id, query, page, perPage }),
    getGamesByIds: (gameIds) => getGamesByIds({ chainId: id, gameIds }),
    getConditionsByGameIds: (gameIds) =>
      getConditionsByGameIds({ chainId: id, gameIds }),
    getConditionsState: (conditionIds) =>
      getConditionsState({ chainId: id, conditionIds }),
    getBetCalculation: (selection, account) =>
      getBetCalculation({ chainId: id, selections: [selection], account }),
    getBetFee: () => getBetFee(id),
    getBetsByBettor: (bettor) => getBetsByBettor({ chainId: id, bettor }),
    submitBet: (params) => createBet(params),
  }
}

/** Implementación real de la wallet sobre clientes viem. */
export function createViemWalletBridge(
  publicClient: PublicClient,
  walletClient: WalletClient,
): AzuroWalletBridge {
  return {
    async readAllowance(token, owner, spender) {
      return publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, spender],
      })
    },
    async approve(token, spender, amount) {
      const account = walletClient.account
      if (!account) throw new Error('La wallet no tiene cuenta activa')
      const hash = await walletClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amount],
        account,
        chain: walletClient.chain,
      })
      await publicClient.waitForTransactionReceipt({ hash })
    },
    async signBetTypedData(typedData) {
      return walletClient.signTypedData(typedData)
    },
  }
}
