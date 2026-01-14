/**
 * Stock Tracker Core - Type Definitions
 *
 * DynamoDB Single Table Design に基づくエンティティの型定義
 */

/**
 * 取引所 (Exchange)
 *
 * 取引所マスタデータ
 */
export type Exchange = {
  /** 取引所ID (PK: EXCHANGE#{ExchangeID}) */
  ExchangeID: string;
  /** 取引所名 (例: NASDAQ, NYSE) */
  Name: string;
  /** TradingView API用キー (例: NSDQ, NYSE) */
  Key: string;
  /** タイムゾーン (IANA形式, 例: America/New_York) */
  Timezone: string;
  /** 取引開始時刻 (HH:MM形式) */
  Start: string;
  /** 取引終了時刻 (HH:MM形式) */
  End: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) */
  UpdatedAt: number;
};

/**
 * ティッカー (Ticker)
 *
 * 銘柄マスタデータ
 */
export type Ticker = {
  /** ティッカーID (PK: TICKER#{TickerID}, 自動生成: {Exchange.Key}:{Symbol}) */
  TickerID: string;
  /** シンボル (例: AAPL, NVDA) */
  Symbol: string;
  /** 銘柄名 (例: Apple Inc., NVIDIA Corporation) */
  Name: string;
  /** 取引所ID */
  ExchangeID: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) */
  UpdatedAt: number;
};

/**
 * 保有株式 (Holding)
 *
 * ユーザーの保有株式情報
 */
export type Holding = {
  /** ユーザーID (PK: USER#{UserID}) */
  UserID: string;
  /** ティッカーID (SK: HOLDING#{TickerID}) */
  TickerID: string;
  /** 取引所ID */
  ExchangeID: string;
  /** 保有数 (0.0001〜1,000,000,000) */
  Quantity: number;
  /** 平均取得価格 (0.01〜1,000,000) */
  AveragePrice: number;
  /** 通貨コード (例: USD, JPY) */
  Currency: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) */
  UpdatedAt: number;
};

/**
 * ウォッチリスト (Watchlist)
 *
 * ユーザーが監視している銘柄
 */
export type Watchlist = {
  /** ユーザーID (PK: USER#{UserID}) */
  UserID: string;
  /** ティッカーID (SK: WATCHLIST#{TickerID}) */
  TickerID: string;
  /** 取引所ID */
  ExchangeID: string;
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
};

/**
 * アラート (Alert)
 *
 * 株価アラート設定と Web Push サブスクリプション情報
 */
export type Alert = {
  /** アラートID (UUID v4) */
  AlertID: string;
  /** ユーザーID (PK: USER#{UserID}) */
  UserID: string;
  /** ティッカーID (SK: ALERT#{AlertID}) */
  TickerID: string;
  /** 取引所ID */
  ExchangeID: string;
  /** モード (Buy: 買いアラート, Sell: 売りアラート) */
  Mode: 'Buy' | 'Sell';
  /** 通知頻度 (MINUTE_LEVEL: 1分間隔, HOURLY_LEVEL: 1時間間隔) */
  Frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  /** 有効/無効フラグ */
  Enabled: boolean;
  /** アラート条件リスト (Phase 1は1条件のみ) */
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
};

/**
 * アラート条件 (AlertCondition)
 *
 * Phase 1: field は "price" 固定、operator は "gte" または "lte" のみ
 */
export type AlertCondition = {
  /** フィールド名 (Phase 1: "price" 固定) */
  field: 'price';
  /** 比較演算子 (gte: >=, lte: <=) */
  operator: 'gte' | 'lte';
  /** 比較値 (0.01〜1,000,000) */
  value: number;
};

/**
 * DynamoDB アイテム型
 *
 * Single Table Design で使用する共通フィールド
 */
export type DynamoDBItem = {
  /** パーティションキー */
  PK: string;
  /** ソートキー */
  SK: string;
  /** エンティティタイプ */
  Type: 'Exchange' | 'Ticker' | 'Holding' | 'Watchlist' | 'Alert';
  /** GSI1 パーティションキー (ユーザーごとのデータ取得用) */
  GSI1PK?: string;
  /** GSI1 ソートキー */
  GSI1SK?: string;
  /** GSI2 パーティションキー (アラート頻度ごとの取得用) */
  GSI2PK?: string;
  /** GSI2 ソートキー */
  GSI2SK?: string;
  /** GSI3 パーティションキー (取引所ごとのティッカー一覧用) */
  GSI3PK?: string;
  /** GSI3 ソートキー */
  GSI3SK?: string;
};
