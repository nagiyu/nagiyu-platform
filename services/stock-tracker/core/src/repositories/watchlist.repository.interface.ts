/**
 * Stock Tracker Core - Watchlist Repository Interface
 *
 * ウォッチリストデータの CRUD 操作インターフェース
 */

import type { WatchlistEntity, CreateWatchlistInput } from '../entities/watchlist.entity.js';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';

/**
 * Watchlist Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface WatchlistRepository {
  /**
   * ユーザーIDとティッカーIDで単一のウォッチリストを取得
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @returns ウォッチリスト（存在しない場合はnull）
   */
  getById(userId: string, tickerId: string): Promise<WatchlistEntity | null>;

  /**
   * ユーザーのウォッチリスト一覧を取得
   *
   * @param userId - ユーザーID
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<WatchlistEntity>>;

  /**
   * 新しいウォッチリストを作成
   *
   * @param input - ウォッチリストデータ
   * @returns 作成されたウォッチリスト（CreatedAtを含む）
   * @throws {WatchlistAlreadyExistsError} 既に同じUserID/TickerIDのウォッチリストが存在する場合
   */
  create(input: CreateWatchlistInput): Promise<WatchlistEntity>;

  /**
   * ウォッチリストを削除
   *
   * @param userId - ユーザーID
   * @param tickerId - ティッカーID
   * @throws {WatchlistNotFoundError} ウォッチリストが存在しない場合
   */
  delete(userId: string, tickerId: string): Promise<void>;
}
