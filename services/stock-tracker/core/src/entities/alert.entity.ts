/**
 * Stock Tracker Core - Alert Entity
 *
 * アラートのビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

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
}

/**
 * アラートエンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 */
export interface AlertEntity {
  /** アラートID */
  AlertID: string;
  /** ユーザーID */
  UserID: string;
  /** ティッカーID */
  TickerID: string;
  /** 取引所ID */
  ExchangeID: string;
  /** モード (Buy: 買いアラート, Sell: 売りアラート) */
  Mode: 'Buy' | 'Sell';
  /** 通知頻度 (MINUTE_LEVEL: 1分間隔, HOURLY_LEVEL: 1時間間隔) */
  Frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  /** 有効/無効フラグ */
  Enabled: boolean;
  /** アラート条件リスト */
  ConditionList: AlertCondition[];
  /** Web Push サブスクリプションエンドポイント */
  SubscriptionEndpoint: string;
  /** Web Push 公開鍵 (p256dh) */
  SubscriptionKeysP256dh: string;
  /** Web Push 認証シークレット */
  SubscriptionKeysAuth: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) */
  UpdatedAt: number;
}

/**
 * Alert作成時の入力データ（AlertID, CreatedAt/UpdatedAtを含まない）
 */
export type CreateAlertInput = Omit<AlertEntity, 'AlertID' | 'CreatedAt' | 'UpdatedAt'>;

/**
 * Alert更新時の入力データ（更新可能なフィールドのみ）
 */
export type UpdateAlertInput = Partial<
  Pick<
    AlertEntity,
    | 'TickerID'
    | 'ExchangeID'
    | 'Mode'
    | 'Frequency'
    | 'Enabled'
    | 'ConditionList'
    | 'SubscriptionEndpoint'
    | 'SubscriptionKeysP256dh'
    | 'SubscriptionKeysAuth'
  >
>;

/**
 * Alertのビジネスキー
 */
export interface AlertKey {
  userId: string;
  alertId: string;
}
