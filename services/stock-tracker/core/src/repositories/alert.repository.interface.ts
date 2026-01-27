/**
 * Stock Tracker Core - Alert Repository Interface
 *
 * アラートデータの CRUD 操作インターフェース
 */

import type {
  AlertEntity,
  CreateAlertInput,
  UpdateAlertInput,
} from '../entities/alert.entity.js';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';

/**
 * Alert Repository インターフェース
 *
 * DynamoDB実装とInMemory実装が共通で実装するインターフェース
 */
export interface AlertRepository {
  /**
   * ユーザーIDとアラートIDで単一のアラートを取得
   *
   * @param userId - ユーザーID
   * @param alertId - アラートID
   * @returns アラート（存在しない場合はnull）
   */
  getById(userId: string, alertId: string): Promise<AlertEntity | null>;

  /**
   * ユーザーのアラート一覧を取得
   *
   * @param userId - ユーザーID
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  getByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResult<AlertEntity>>;

  /**
   * 頻度ごとのアラート一覧を取得（バッチ処理用）
   *
   * @param frequency - 通知頻度
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  getByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<AlertEntity>>;

  /**
   * 新しいアラートを作成
   *
   * @param input - アラートデータ
   * @returns 作成されたアラート（AlertID, CreatedAt, UpdatedAtを含む）
   */
  create(input: CreateAlertInput): Promise<AlertEntity>;

  /**
   * アラートを更新
   *
   * @param userId - ユーザーID
   * @param alertId - アラートID
   * @param updates - 更新するフィールド
   * @returns 更新されたアラート
   * @throws {EntityNotFoundError} アラートが存在しない場合
   */
  update(userId: string, alertId: string, updates: UpdateAlertInput): Promise<AlertEntity>;

  /**
   * アラートを削除
   *
   * @param userId - ユーザーID
   * @param alertId - アラートID
   * @throws {EntityNotFoundError} アラートが存在しない場合
   */
  delete(userId: string, alertId: string): Promise<void>;
}
