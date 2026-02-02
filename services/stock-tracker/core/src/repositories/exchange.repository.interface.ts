/**
 * Stock Tracker Core - Exchange Repository Interface
 *
 * 取引所データの CRUD 操作インターフェース
 */

import type { Exchange } from '../types.js';

/**
 * Exchange Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface ExchangeRepository {
  /**
   * 取引所IDで単一の取引所を取得
   *
   * @param exchangeId - 取引所ID
   * @returns 取引所（存在しない場合はnull）
   */
  getById(exchangeId: string): Promise<Exchange | null>;

  /**
   * 全取引所を取得
   *
   * @returns 取引所の配列
   */
  getAll(): Promise<Exchange[]>;

  /**
   * 新しい取引所を作成
   *
   * @param input - 取引所データ
   * @returns 作成された取引所（CreatedAt, UpdatedAtを含む）
   */
  create(
    input: Omit<Exchange, 'CreatedAt' | 'UpdatedAt'>
  ): Promise<Exchange>;

  /**
   * 取引所を更新
   *
   * @param exchangeId - 取引所ID
   * @param updates - 更新するフィールド
   * @returns 更新された取引所
   * @throws {EntityNotFoundError} 取引所が存在しない場合
   */
  update(
    exchangeId: string,
    updates: Partial<Pick<Exchange, 'Name' | 'Timezone' | 'Start' | 'End'>>
  ): Promise<Exchange>;

  /**
   * 取引所を削除
   *
   * @param exchangeId - 取引所ID
   * @throws {EntityNotFoundError} 取引所が存在しない場合
   */
  delete(exchangeId: string): Promise<void>;
}
