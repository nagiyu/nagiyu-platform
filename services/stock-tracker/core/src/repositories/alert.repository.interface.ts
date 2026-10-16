/**
 * Stock Tracker Core - Alert Repository Interface
 *
 * アラートデータの CRUD 操作インターフェース
 */

import type { AlertEntity, CreateAlertInput, UpdateAlertInput } from '../entities/alert.entity.js';
import type { TemporaryAlertCandidate } from '../entities/temporary-alert-candidate.entity.js';
import type { PaginationOptions, PaginatedResult } from '@nagiyu/aws';

/**
 * `getByUserId` のオプション。
 *
 * 実装は常に「論理削除待ちのアラート（DynamoDB TTL 属性が設定されているアイテム）」を
 * 結果から除外する。ユーザーが無効化したアラート（`Enabled=false` で TTL は未設定）は
 * 引き続き返される。
 */
export type GetByUserIdOptions = PaginationOptions;

/**
 * 読めなかったアラートアイテムの情報。
 *
 * userId / alertId はアイテムの属性から取れたときだけ入る。取れないアイテムも特定できるよう、
 * 保存キー (PK / SK) を常に併せて返す。
 */
export interface UnreadableAlertItem {
  userId?: string;
  alertId?: string;
  pk?: string;
  sk?: string;
  /** 読めなかった理由 (検証エラーのメッセージ) */
  reason: string;
}

/**
 * `getAllForSubscriptionAudit` の結果。
 */
export interface AlertAuditResult {
  /** 読めたアラート */
  alerts: AlertEntity[];
  /** 読めなかったアイテム */
  unreadable: UnreadableAlertItem[];
}

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
   * 論理削除待ち（expiresAt が設定済み）のアラートは常に結果から除外される。
   *
   * limit省略時は既定50件で打ち切られる（後続はページネーションで辿る前提。
   * 全件が必要な場合は呼び出し側でcursorを使って走査すること）。
   *
   * @param userId - ユーザーID
   * @param options - ページネーションオプション
   * @returns ページネーション結果
   */
  getByUserId(userId: string, options?: GetByUserIdOptions): Promise<PaginatedResult<AlertEntity>>;

  /**
   * 頻度ごとのアラート一覧を取得（バッチ処理用）。
   *
   * 全件を返す契約（内部でページを辿り切る）。呼び出し側はページネーションを
   * 意識する必要がなく、cursorループも不要。
   *
   * 返却順序は userId の昇順（同一 userId 内は alertId の昇順）を契約とする。
   * 論理削除待ち（expiresAt 設定済み）のアラートも含む。
   *
   * @param frequency - 通知頻度
   * @returns 指定頻度の全アラート（userId昇順、同一userId内はalertId昇順）
   */
  getByFrequency(frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL'): Promise<AlertEntity[]>;

  /**
   * 全頻度のアラートを、読めないアイテムも含めて取得する (購読の点検用)。
   *
   * `getByFrequency` は読めないアイテムを警告ログだけ出して捨てるため、
   * 呼び出し側からは「無かったこと」になる。購読の点検では、壊れたアラートこそ
   * 見つけて手動で直す対象なので、読めなかったアイテムを捨てずに返す。
   *
   * 全頻度を内部でページを辿り切って集約する。論理削除待ち (expiresAt 設定済み) のアラートも含む。
   *
   * @returns 読めたアラートと、読めなかったアイテム (頻度順、各頻度内は userId 昇順、同一 userId 内は alertId 昇順)
   */
  getAllForSubscriptionAudit(): Promise<AlertAuditResult>;

  /**
   * 一時アラート失効バッチ用の軽量取得。
   *
   * subscription / conditionList などバッチ処理に不要な属性を取得・検証せず、
   * `temporary = true` かつ `expiresAt` 未設定のアラートを返す。
   * 既に `markTemporaryAsExpired` 済み（expiresAt あり）は除外する。
   * enabled=false でもユーザー手動無効化された一時アラートはバッチで回収するため候補に含める。
   *
   * 返却順序は userId の昇順（同一 userId 内は alertId の昇順）を契約とする。
   * limit省略時は既定50件で打ち切られる（後続はページネーションで辿る前提。
   * 全件が必要な場合は呼び出し側でcursorを使って走査すること）。
   *
   * @param frequency - 通知頻度
   * @param options - ページネーションオプション
   * @returns 失効判定対象の候補（userId昇順、同一userId内はalertId昇順）
   */
  getTemporaryCandidatesByFrequency(
    frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
    options?: PaginationOptions
  ): Promise<PaginatedResult<TemporaryAlertCandidate>>;

  /**
   * 一時アラートを失効状態にする（無効化 + 物理削除時刻の設定）。
   *
   * `enabled = false` への更新と `expiresAt` の設定を 1 回の更新で行う。
   * subscription を書き換えないため、subscription が壊れたアラートでも書き込みは完了する。
   * ただし更新後の Entity への変換で壊れたデータが分かるため、その場合は書き込み後に
   * `InvalidEntityDataError` を投げる。
   *
   * @param userId - ユーザーID
   * @param alertId - アラートID
   * @param expiresAt - 物理削除される時刻 (Unix timestamp ミリ秒)
   * @throws {EntityNotFoundError} アラートが存在しない場合
   * @throws {InvalidEntityDataError} 更新後のアラートが読めない場合 (書き込みは完了している)
   */
  markTemporaryAsExpired(userId: string, alertId: string, expiresAt: number): Promise<void>;

  /**
   * 新しいアラートを作成
   *
   * @param input - アラートデータ
   * @returns 作成されたアラート（alertId, createdAt, updatedAtを含む）
   */
  create(input: CreateAlertInput): Promise<AlertEntity>;

  /**
   * アラートを更新
   *
   * `updates` が空でも成功し、更新日時だけが更新される。
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
