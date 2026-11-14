/**
 * チャット API 保護ガードのリポジトリインターフェース。
 *
 * - レート制限: 固定ウィンドウカウンタ（1 分・1 時間の 2 ウィンドウ、上限付きで数える）
 * - 並行制御: 同一ユーザーの in-flight リクエストを 1 本に限定するロック
 */

/**
 * レート制限ウィンドウの種別。
 */
export type RateLimitWindow = '1m' | '1h';

/** レート制限アイテムの Type 属性値 */
export const CHAT_RATE_LIMIT_ITEM_TYPE = 'ChatRateLimit';

/**
 * 窓ごとの上限。
 */
export interface RateLimitLimits {
  /** 1 分の窓で通せる回数 */
  perMinute: number;
  /** 1 時間の窓で通せる回数 */
  perHour: number;
}

/**
 * レート制限の判定結果。断られたときは、断った窓を持つ。
 */
export type TryConsumeRateLimitResult =
  { allowed: true } | { allowed: false; window: RateLimitWindow };

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
   * 1 分 → 1 時間の順に、上限に達していなければ 1 回分を数える。
   *
   * 上限の判定は条件付き更新でアトミックに行い、断られた申し込みはどちらの窓も消費しない
   * (1 時間で断られたら、先に数えた 1 分を戻す)。
   * 同時に呼ばれると実際より多く数えて断る側にずれることがある。
   *
   * @returns 通したとき `{ allowed: true }`、断ったとき `{ allowed: false, window }`
   * @throws 記録の読み書きに失敗したとき
   */
  tryConsumeRateLimit(
    userId: string,
    nowMs: number,
    limits: RateLimitLimits
  ): Promise<TryConsumeRateLimitResult>;

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
