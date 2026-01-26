/**
 * Stock Tracker Core - Holding Repository Interface
 *
 * 保有株式データの CRUD 操作インターフェース
 */

import type { HoldingEntity, CreateHoldingInput, UpdateHoldingInput } from '../entities/holding.entity.js';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';

/**
 * Holding Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface HoldingRepository {
  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @returns 保有株式（存在しない場合はnull）
   */
  getById(userId: string, tickerId: string): Promise<HoldingEntity | null>;

  /**
   * ユーザーの保有株式一覧を取得
   *
   * @param userId - ユーザーID
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  getByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResult<HoldingEntity>>;

  /**
   * 新しい保有株式を作成
   *
   * @param input - 保有株式データ
   * @returns 作成された保有株式（CreatedAt, UpdatedAtを含む）
   * @throws {EntityAlreadyExistsError} 既に同じUserID/TickerIDの保有株式が存在する場合
   */
  create(input: CreateHoldingInput): Promise<HoldingEntity>;

  /**
   * 保有株式を更新
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @param updates - 更新するフィールド
   * @returns 更新された保有株式
   * @throws {EntityNotFoundError} 保有株式が存在しない場合
   */
  update(userId: string, tickerId: string, updates: UpdateHoldingInput): Promise<HoldingEntity>;

  /**
   * 保有株式を削除
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @throws {EntityNotFoundError} 保有株式が存在しない場合
   */
  delete(userId: string, tickerId: string): Promise<void>;
}
