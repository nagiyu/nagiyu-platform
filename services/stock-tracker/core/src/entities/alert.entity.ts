/**
 * Stock Tracker Core - Alert Entity
 *
 * アラートのビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

import type { PushSubscription } from '@nagiyu/common';

/**
 * アラート条件
 */
export interface AlertCondition {
  /** フィールド名 (Phase 1: "price" 固定) */
  field: 'price';
  /** 比較演算子 (gte: >=, lte: <=) */
  operator: 'gte' | 'lte';
  /** 比較値 */
  value: number;
  /** パーセンテージ指定フラグ（true: パーセンテージで設定された条件） */
  isPercentage?: boolean;
  /** パーセンテージ値（isPercentage が true の場合のみ有効、基準価格からの変動率） */
  percentageValue?: number;
  /** パーセンテージ計算時の基準価格（isPercentage が true の場合に保存） */
  basePrice?: number;
}

/**
 * アラートエンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 *
 * バリデーションルール:
 * - alertId: UUID v4形式、自動生成、作成後変更不可
 * - userId / tickerId / exchangeId: 作成後変更不可
 * - mode: "Buy" または "Sell"
 * - frequency: "MINUTE_LEVEL" または "HOURLY_LEVEL"
 * - conditionList: 1〜2条件 (2条件のときは logicalOperator が必須)
 * - createdAt: 作成後変更不可
 */
export interface AlertEntity {
  /** アラートID。作成後変更不可 */
  alertId: string;
  /** ユーザーID。作成後変更不可 */
  userId: string;
  /** ティッカーID。作成後変更不可 */
  tickerId: string;
  /** 取引所ID。作成後変更不可 */
  exchangeId: string;
  /** モード (Buy: 買いアラート, Sell: 売りアラート) */
  mode: 'Buy' | 'Sell';
  /** 通知頻度 (MINUTE_LEVEL: 1分間隔, HOURLY_LEVEL: 1時間間隔) */
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  /** 有効/無効フラグ */
  enabled: boolean;
  /** 一時通知フラグ（true: 取引終了後に自動無効化） */
  temporary?: boolean;
  /** 一時通知の期限取引日（YYYY-MM-DD, 取引所タイムゾーン基準） */
  temporaryExpireDate?: string;
  /** アラート条件リスト */
  conditionList: AlertCondition[];
  /** 論理演算子 (AND: 範囲内, OR: 範囲外) - 2条件の場合のみ使用。未指定の場合はデフォルトで 'AND' として扱われる */
  logicalOperator?: 'AND' | 'OR';
  /** カスタムメッセージ（通知本文の末尾に追加される任意テキスト） */
  customMessage?: string;
  /** Web Push サブスクリプション情報 */
  subscription: PushSubscription;
  /**
   * 物理削除される時刻 (Unix timestamp ミリ秒)
   *
   * 一時アラートの失効バッチが設定する。設定済みのアラートは論理削除待ちとして、
   * ユーザーの一覧から除外される。
   */
  expiresAt?: number;
  /** 作成日時 (Unix timestamp ミリ秒) */
  createdAt: number;
  /** 更新日時 (Unix timestamp ミリ秒) */
  updatedAt: number;
}

/**
 * Alert作成時の入力データ（alertId, expiresAt, createdAt/updatedAtを含まない）
 */
export type CreateAlertInput = Omit<
  AlertEntity,
  'alertId' | 'expiresAt' | 'createdAt' | 'updatedAt'
>;

/**
 * Alert更新時の入力データ（更新可能なフィールドのみ）
 *
 * 任意項目は `undefined`（更新しない）と `null`（未設定に戻す）を区別する。
 */
export type UpdateAlertInput = Partial<
  Pick<
    AlertEntity,
    'mode' | 'frequency' | 'enabled' | 'temporary' | 'conditionList' | 'subscription'
  >
> & {
  /** 一時通知の期限取引日。undefined: 更新しない、null: 削除する */
  temporaryExpireDate?: string | null;
  /** 論理演算子。undefined: 更新しない、null: 削除する */
  logicalOperator?: 'AND' | 'OR' | null;
  /** カスタムメッセージ。undefined: 更新しない、null: 削除する */
  customMessage?: string | null;
};

/**
 * Alertのビジネスキー
 */
export interface AlertKey {
  userId: string;
  alertId: string;
}
