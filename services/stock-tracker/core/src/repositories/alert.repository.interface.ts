/**
 * Stock Tracker Core - Alert Repository Interface
 *
 * アラートデータの CRUD 操作インターフェース
 */

import type { AlertEntity, CreateAlertInput, UpdateAlertInput } from '../entities/alert.entity.js';
import type { TemporaryAlertCandidate } from '../entities/temporary-alert-candidate.entity.js';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';

/**
 * `getByUserId` のオプション。`enabledOnly: true` の場合、有効化済み（Enabled=true）の
 * アラートのみを返す。Web のアラート一覧表示など、無効化されたアラートを除外したい用途で使用する。
 */
export type GetByUserIdOptions = PaginationOptions & {
  enabledOnly?: boolean;
};

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
   * @param options - ページネーション + `enabledOnly` フィルタ
   * @returns ページネーション結果
   */
  getByUserId(userId: string, options?: GetByUserIdOptions): Promise<PaginatedResult<AlertEntity>>;

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
   * 一時アラート失効バッチ用の軽量取得。
   *
   * subscription / ConditionList などバッチ処理に不要な属性を取得・検証せず、
   * `Temporary = true AND Enabled = true` のアラートのみを返す。
   *
   * @param frequency - 通知頻度
   * @param options - ページネーションオプション
   * @returns 失効判定対象の候補
   */
  getTemporaryCandidatesByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<TemporaryAlertCandidate>>;

  /**
   * 一時アラートを失効状態にする（無効化 + TTL 設定）。
   *
   * `Enabled = false` への更新と DynamoDB TTL 属性の設定を 1 回の UpdateItem で行う。
   * subscription を読み書きしないため、subscription データが不整合でも安全に呼び出せる。
   *
   * @param userId - ユーザーID
   * @param alertId - アラートID
   * @param ttlSeconds - DynamoDB TTL 属性に設定する Unix 秒
   * @throws {EntityNotFoundError} アラートが存在しない場合
   */
  markTemporaryAsExpired(userId: string, alertId: string, ttlSeconds: number): Promise<void>;

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
