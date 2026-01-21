/**
 * Stock Tracker Core - Type Definitions
 *
 * DynamoDB Single Table Design に基づくエンティティの型定義
 */

/**
 * 取引所 (Exchange)
 *
 * 取引所マスタデータ
 *
 * バリデーションルール:
 * - ExchangeID: 1-50文字、英数字とハイフン、作成後変更不可
 * - Name: 1-200文字、必須
 * - Key: 1-20文字、英大文字と数字のみ、作成後変更不可（TickerID生成に使用）
 * - Timezone: IANA形式（例: America/New_York）
 * - Start: HH:MM形式（例: 04:00）、時間外取引込みの開始時刻
 * - End: HH:MM形式（例: 20:00）、時間外取引込みの終了時刻
 * - CreatedAt: Unix timestamp、作成後変更不可
 * - UpdatedAt: Unix timestamp、更新時に自動更新
 *
 * データ整合性:
 * - 削除時、関連するHolding/Watchlist/Alertが存在する場合は削除不可
 */
export type Exchange = {
  /** 取引所ID (PK: EXCHANGE#{ExchangeID}) - 1-50文字、英数字とハイフン、変更不可 */
  ExchangeID: string;
  /** 取引所名 (例: NASDAQ, NYSE) - 1-200文字 */
  Name: string;
  /** TradingView API用キー (例: NSDQ, NYSE) - 1-20文字、英大文字と数字のみ、変更不可 */
  Key: string;
  /** タイムゾーン (IANA形式, 例: America/New_York) */
  Timezone: string;
  /** 取引開始時刻 (HH:MM形式, 例: 04:00) - 時間外取引込み */
  Start: string;
  /** 取引終了時刻 (HH:MM形式, 例: 20:00) - 時間外取引込み */
  End: string;
  /** 作成日時 (Unix timestamp) - 変更不可 */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) - 自動更新 */
  UpdatedAt: number;
};

/**
 * ティッカー (Ticker)
 *
 * 銘柄マスタデータ
 *
 * バリデーションルール:
 * - TickerID: {Exchange.Key}:{Symbol} 形式で自動生成（例: NSDQ:AAPL）、変更不可
 * - Symbol: 1-20文字、英大文字と数字のみ、変更時は削除→再作成を推奨
 * - Name: 1-200文字、必須
 * - ExchangeID: 有効な取引所ID、変更不可
 * - CreatedAt: Unix timestamp、作成後変更不可
 * - UpdatedAt: Unix timestamp、更新時に自動更新
 *
 * データ整合性:
 * - 削除時、関連するHolding/Watchlist/Alertが存在する場合は削除不可
 * - TickerIDはExchange.Keyから生成されるため、Exchange.Keyの変更不可制約に依存
 */
export type Ticker = {
  /** ティッカーID (PK: TICKER#{TickerID}, 自動生成: {Exchange.Key}:{Symbol}, 例: NSDQ:AAPL) - 変更不可 */
  TickerID: string;
  /** シンボル (例: AAPL, NVDA) - 1-20文字、英大文字と数字のみ */
  Symbol: string;
  /** 銘柄名 (例: Apple Inc., NVIDIA Corporation) - 1-200文字 */
  Name: string;
  /** 取引所ID - 有効な取引所ID、変更不可 */
  ExchangeID: string;
  /** 作成日時 (Unix timestamp) - 変更不可 */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) - 自動更新 */
  UpdatedAt: number;
};

/**
 * 保有株式 (Holding)
 *
 * ユーザーの保有株式情報
 *
 * バリデーションルール:
 * - UserID: 必須、有効なユーザーID
 * - TickerID: 必須、有効なティッカーID
 * - ExchangeID: 必須、有効な取引所ID
 * - Quantity: 0.0001〜1,000,000,000、必須
 * - AveragePrice: 0.01〜1,000,000、必須
 * - Currency: 通貨コード（例: USD, JPY）、必須
 * - CreatedAt: Unix timestamp、作成後変更不可
 * - UpdatedAt: Unix timestamp、更新時に自動更新
 */
export type Holding = {
  /** ユーザーID (PK: USER#{UserID}) - 必須 */
  UserID: string;
  /** ティッカーID (SK: HOLDING#{TickerID}) - 必須 */
  TickerID: string;
  /** 取引所ID - 必須 */
  ExchangeID: string;
  /** 保有数 - 範囲: 0.0001〜1,000,000,000 */
  Quantity: number;
  /** 平均取得価格 - 範囲: 0.01〜1,000,000 */
  AveragePrice: number;
  /** 通貨コード (例: USD, JPY) - 必須 */
  Currency: string;
  /** 作成日時 (Unix timestamp) - 変更不可 */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) - 自動更新 */
  UpdatedAt: number;
};

/**
 * ウォッチリスト (Watchlist)
 *
 * ユーザーが監視している銘柄
 *
 * バリデーションルール:
 * - UserID: 必須、有効なユーザーID
 * - TickerID: 必須、有効なティッカーID
 * - ExchangeID: 必須、有効な取引所ID
 * - CreatedAt: Unix timestamp、作成後変更不可
 */
export type Watchlist = {
  /** ユーザーID (PK: USER#{UserID}) - 必須 */
  UserID: string;
  /** ティッカーID (SK: WATCHLIST#{TickerID}) - 必須 */
  TickerID: string;
  /** 取引所ID - 必須 */
  ExchangeID: string;
  /** 作成日時 (Unix timestamp) - 変更不可 */
  CreatedAt: number;
};

/**
 * アラート (Alert)
 *
 * 株価アラート設定と Web Push サブスクリプション情報
 *
 * バリデーションルール:
 * - AlertID: UUID v4形式、自動生成、変更不可
 * - UserID: 必須、有効なユーザーID
 * - TickerID: 必須、有効なティッカーID
 * - ExchangeID: 必須、有効な取引所ID
 * - Mode: "Buy" または "Sell"、必須
 * - Frequency: "MINUTE_LEVEL" または "HOURLY_LEVEL"、必須
 * - Enabled: boolean、必須（アラートの一時無効化に使用）
 * - ConditionList: 配列、Phase 1は1条件のみ、必須
 * - SubscriptionEndpoint: Web Pushエンドポイント、必須
 * - SubscriptionKeysP256dh: Web Push公開鍵、必須
 * - SubscriptionKeysAuth: Web Push認証シークレット、必須
 * - CreatedAt: Unix timestamp、作成後変更不可
 * - UpdatedAt: Unix timestamp、更新時に自動更新
 *
 * GSI2 (AlertIndex) 設計:
 * - PK: ALERT#{Frequency} (例: ALERT#MINUTE_LEVEL)
 * - SK: {UserID}#{AlertID}
 * - 用途: バッチ処理で頻度ごとのアラート一覧を取得
 *
 * Phase 1 仕様:
 * - ConditionList は1条件のみ（複数条件は Phase 2）
 * - operator は "gte" または "lte" のみ対応（"eq" は Phase 2）
 * - 条件達成時は毎回通知（FirstNotificationSentフラグは不使用）
 */
export type Alert = {
  /** アラートID (UUID v4) - 自動生成、変更不可 */
  AlertID: string;
  /** ユーザーID (PK: USER#{UserID}) - 必須 */
  UserID: string;
  /** ティッカーID (SK: ALERT#{AlertID}) - 必須 */
  TickerID: string;
  /** 取引所ID - 必須 */
  ExchangeID: string;
  /** モード (Buy: 買いアラート, Sell: 売りアラート) - 必須 */
  Mode: 'Buy' | 'Sell';
  /** 通知頻度 (MINUTE_LEVEL: 1分間隔, HOURLY_LEVEL: 1時間間隔) - 必須 */
  Frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  /** 有効/無効フラグ - 必須 */
  Enabled: boolean;
  /** アラート条件リスト (Phase 1は1条件のみ) - 必須 */
  ConditionList: AlertCondition[];
  /** Web Push サブスクリプションエンドポイント - 必須 */
  SubscriptionEndpoint: string;
  /** Web Push 公開鍵 (p256dh) - 必須 */
  SubscriptionKeysP256dh: string;
  /** Web Push 認証シークレット - 必須 */
  SubscriptionKeysAuth: string;
  /** 作成日時 (Unix timestamp) - 変更不可 */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp) - 自動更新 */
  UpdatedAt: number;
};

/**
 * アラート条件 (AlertCondition)
 *
 * Phase 1: field は "price" 固定、operator は "gte" または "lte" のみ
 *
 * バリデーションルール:
 * - field: "price" 固定（Phase 1）
 * - operator: "gte" (>=) または "lte" (<=) のみ（Phase 1）
 *   - "eq" (==) は Phase 2 で実装
 * - value: 0.01〜1,000,000、必須
 *
 * 使用例:
 * - 買いアラート: { field: "price", operator: "lte", value: 150.00 } // 150ドル以下で買い
 * - 売りアラート: { field: "price", operator: "gte", value: 200.00 } // 200ドル以上で売り
 */
export type AlertCondition = {
  /** フィールド名 (Phase 1: "price" 固定) */
  field: 'price';
  /** 比較演算子 (gte: >=, lte: <=) - Phase 1は "eq" 非対応 */
  operator: 'gte' | 'lte';
  /** 比較値 - 範囲: 0.01〜1,000,000 */
  value: number;
};

/**
 * DynamoDB アイテム型
 *
 * Single Table Design で使用する共通フィールド
 *
 * キー設計:
 * - PK/SK: メインテーブルのキー（エンティティごとに異なる）
 * - GSI1PK/GSI1SK: ユーザーごとのデータ取得用（UserIndex）
 * - GSI2PK/GSI2SK: アラート頻度ごとの取得用（AlertIndex、バッチ処理）
 * - GSI3PK/GSI3SK: 取引所ごとのティッカー一覧用（ExchangeTickerIndex）
 *
 * エンティティ別キー設計:
 *
 * Exchange:
 * - PK: EXCHANGE#{ExchangeID}
 * - SK: METADATA
 * - Type: Exchange
 *
 * Ticker:
 * - PK: TICKER#{TickerID}
 * - SK: METADATA
 * - Type: Ticker
 * - GSI3PK: {ExchangeID}
 * - GSI3SK: TICKER#{TickerID}
 *
 * Holding:
 * - PK: USER#{UserID}
 * - SK: HOLDING#{TickerID}
 * - Type: Holding
 * - GSI1PK: {UserID}
 * - GSI1SK: Holding#{TickerID}
 *
 * Watchlist:
 * - PK: USER#{UserID}
 * - SK: WATCHLIST#{TickerID}
 * - Type: Watchlist
 * - GSI1PK: {UserID}
 * - GSI1SK: Watchlist#{TickerID}
 *
 * Alert:
 * - PK: USER#{UserID}
 * - SK: ALERT#{AlertID}
 * - Type: Alert
 * - GSI1PK: {UserID}
 * - GSI1SK: Alert#{AlertID}
 * - GSI2PK: ALERT#{Frequency}
 * - GSI2SK: {UserID}#{AlertID}
 */
export type DynamoDBItem = {
  /** パーティションキー - エンティティごとに異なる形式 */
  PK: string;
  /** ソートキー - エンティティごとに異なる形式 */
  SK: string;
  /** エンティティタイプ - データの種類を識別 */
  Type: 'Exchange' | 'Ticker' | 'Holding' | 'Watchlist' | 'Alert';
  /** GSI1 パーティションキー (ユーザーごとのデータ取得用) - Holding/Watchlist/Alertで使用 */
  GSI1PK?: string;
  /** GSI1 ソートキー - Holding/Watchlist/Alertで使用 */
  GSI1SK?: string;
  /** GSI2 パーティションキー (アラート頻度ごとの取得用) - Alertのみ使用 */
  GSI2PK?: string;
  /** GSI2 ソートキー - Alertのみ使用 */
  GSI2SK?: string;
  /** GSI3 パーティションキー (取引所ごとのティッカー一覧用) - Tickerのみ使用 */
  GSI3PK?: string;
  /** GSI3 ソートキー - Tickerのみ使用 */
  GSI3SK?: string;
};

/**
 * チャートデータポイント (ChartDataPoint)
 *
 * OHLCV（始値・高値・安値・終値・出来高）形式の株価データ
 *
 * Note: TradingView API の PricePeriod から変換した形式
 * - PricePeriod の max/min を high/low に変換して使用
 * - PricePeriod の time（秒）をミリ秒に変換して使用
 * - 標準的な OHLCV 形式（high/low）で統一するため独自型として定義
 */
export type ChartDataPoint = {
  /** タイムスタンプ (Unix timestamp ミリ秒) */
  time: number;
  /** 始値 */
  open: number;
  /** 高値 (TradingView API の max を変換) */
  high: number;
  /** 安値 (TradingView API の min を変換) */
  low: number;
  /** 終値 */
  close: number;
  /** 出来高 */
  volume: number;
};

/**
 * チャートデータ (ChartData)
 *
 * チャートデータ API のレスポンス形式
 *
 * Note: TimeFrame 型は @types/mathieuc__tradingview から import して使用
 */
export type ChartData = {
  /** ティッカーID (例: "NSDQ:NVDA") */
  tickerId: string;
  /** シンボル (例: "NVDA") */
  symbol: string;
  /** タイムフレーム (例: "60") */
  timeframe: string;
  /** チャートデータポイントの配列 */
  data: ChartDataPoint[];
};
