/**
 * チャット API 保護ガードのリポジトリインターフェース。
 *
 * - レート制限: 固定ウィンドウカウンタ（1 分・1 時間の 2 ウィンドウ）
 * - 並行制御: 同一ユーザーの in-flight リクエストを 1 本に限定するロック
 */

/**
 * レート制限ウィンドウの種別。
 */
export type RateLimitWindow = '1m' | '1h';

/**
 * レート制限カウンタのインクリメント結果。
 */
export interface RateLimitResult {
  /** インクリメント後のカウント値 */
  count: number;
  /** ウィンドウ種別 */
  window: RateLimitWindow;
}

/**
 * ロック取得の結果。
 */
export interface AcquireLockResult {
  /** ロックを取得できたか */
  acquired: boolean;
  /** 取得できた場合のオーナートークン */
  ownerToken?: string;
}

/**
 * チャット API 保護ガードのリポジトリインターフェース。
 */
export interface ChatGuardRepository {
  /**
   * 指定ウィンドウのレートリミットカウンタをインクリメントして結果を返す。
   * アイテムが存在しない場合は count=1 で新規作成する。
   * TTL は当該ウィンドウ満了 + バッファで自動設定される。
   */
  incrementRateLimit(
    userId: string,
    window: RateLimitWindow,
    nowMs: number
  ): Promise<RateLimitResult>;

  /**
   * in-flight ロックを取得する。
   *
   * - アイテムが存在しない場合: 新規作成してロック取得成功
   * - ExpiresAt < now の場合: 期限切れとして上書き取得成功（DynamoDB TTL 遅延対策）
   * - ロックが有効な場合: 取得失敗（acquired=false）
   *
   * @param userId - ユーザー ID
   * @param ownerToken - 新規ロックに付与するオーナートークン（ULID 等）
   * @param lockTtlMs - ロック有効期間（ミリ秒）
   * @param nowMs - 現在時刻（ミリ秒）
   */
  acquireLock(
    userId: string,
    ownerToken: string,
    lockTtlMs: number,
    nowMs: number
  ): Promise<AcquireLockResult>;

  /**
   * in-flight ロックを解放する。
   *
   * ownerToken が一致しない場合は削除をスキップする（ConditionalCheckFailed 相当）。
   * 既に失効・奪取済みの場合も安全に握りつぶす。
   *
   * @param userId - ユーザー ID
   * @param ownerToken - 取得時に保存したオーナートークン
   */
  releaseLock(userId: string, ownerToken: string): Promise<void>;
}
