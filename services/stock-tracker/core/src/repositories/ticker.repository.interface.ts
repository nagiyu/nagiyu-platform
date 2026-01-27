/**
 * Stock Tracker Core - Ticker Repository Interface
 *
 * ティッカーデータの CRUD 操作インターフェース
 */

import type {
  TickerEntity,
  CreateTickerInput,
  UpdateTickerInput,
} from '../entities/ticker.entity.js';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';

/**
 * Ticker Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface TickerRepository {
  /**
   * ティッカーIDで単一のティッカーを取得
   *
   * @param tickerId - ティッカーID
   * @returns ティッカー（存在しない場合はnull）
   */
  getById(tickerId: string): Promise<TickerEntity | null>;

  /**
   * 取引所ごとのティッカー一覧を取得
   *
   * @param exchangeId - 取引所ID
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  getByExchange(exchangeId: string, options?: PaginationOptions): Promise<PaginatedResult<TickerEntity>>;

  /**
   * 全ティッカー取得
   *
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  getAll(options?: PaginationOptions): Promise<PaginatedResult<TickerEntity>>;

  /**
   * 新しいティッカーを作成
   *
   * @param input - ティッカーデータ
   * @returns 作成されたティッカー（CreatedAt, UpdatedAtを含む）
   * @throws {EntityAlreadyExistsError} 既に同じTickerIDのティッカーが存在する場合
   */
  create(input: CreateTickerInput): Promise<TickerEntity>;

  /**
   * ティッカーを更新
   *
   * @param tickerId - ティッカーID
   * @param updates - 更新するフィールド
   * @returns 更新されたティッカー
   * @throws {EntityNotFoundError} ティッカーが存在しない場合
   */
  update(tickerId: string, updates: UpdateTickerInput): Promise<TickerEntity>;

  /**
   * ティッカーを削除
   *
   * @param tickerId - ティッカーID
   * @throws {EntityNotFoundError} ティッカーが存在しない場合
   */
  delete(tickerId: string): Promise<void>;
}
