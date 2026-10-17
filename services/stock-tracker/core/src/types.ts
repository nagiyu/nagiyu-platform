/**
 * Stock Tracker Core - Type Definitions
 *
 * DynamoDB Single Table Design に基づくエンティティの型定義
 */

import type { PushSubscription } from '@nagiyu/common';

/**
 * 日次サマリー (DailySummary)
 *
 * 特定ティッカーの特定日における OHLCV（始値・高値・安値・終値・出来高）の日次集計データ
 */
export type DailySummary = {
  /** ティッカーID (PK: SUMMARY#{TickerID}) */
  TickerID: string;
  /** 取引所ID */
  ExchangeID: string;
  /** 取引日 (YYYY-MM-DD 形式, UTC基準) */
  Date: string;
  /** 始値 */
  Open: number;
  /** 高値 */
  High: number;
  /** 安値 */
  Low: number;
  /** 終値 */
  Close: number;
  /** 出来高 */
  Volume?: number;
  /** 作成日時 (Unix timestamp ms) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp ms) */
  UpdatedAt: number;
};

/**
 * パターン判定状態
 */
export type PatternStatus = 'MATCHED' | 'NOT_MATCHED' | 'INSUFFICIENT_DATA';

/**
 * パターンの売買区分
 */
export type PatternSignalType = 'BUY' | 'SELL';

/**
 * パターン定義
 */
export interface PatternDefinition {
  patternId: string;
  name: string;
  description: string;
  signalType: PatternSignalType;
}

/**
 * ティッカー単位のパターン判定結果マップ
 *
 * キー: patternId
 * 値: PatternStatus
 */
export type PatternResults = Record<string, PatternStatus>;

/**
 * PatternResults のデフォルト値（バッチ未実行時）
 */
export const DEFAULT_PATTERN_RESULTS: PatternResults = {};

/**
 * 買いシグナル合致数のデフォルト値
 */
export const DEFAULT_BUY_PATTERN_COUNT = 0;

/**
 * 売りシグナル合致数のデフォルト値
 */
export const DEFAULT_SELL_PATTERN_COUNT = 0;

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
 * - subscription: Web Pushサブスクリプション情報、必須
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
  /** 一時通知フラグ（true: 取引終了後に自動無効化） */
  Temporary?: boolean;
  /** 一時通知の期限取引日（YYYY-MM-DD, 取引所タイムゾーン基準） */
  TemporaryExpireDate?: string;
  /** アラート条件リスト (Phase 1は1条件のみ) - 必須 */
  ConditionList: AlertCondition[];
  /** 論理演算子 (AND: 範囲内, OR: 範囲外) - 2条件の場合のみ使用。未指定の場合はデフォルトで 'AND' として扱われる */
  LogicalOperator?: 'AND' | 'OR';
  /** カスタムメッセージ（通知本文の末尾に追加される任意テキスト） */
  CustomMessage?: string;
  /** Web Push サブスクリプション情報 - 必須 */
  subscription: PushSubscription;
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
 * Alert:
 * - PK: USER#{UserID}
 * - SK: ALERT#{AlertID}
 * - Type: Alert
 * - GSI1PK: {UserID}
 * - GSI1SK: Alert#{AlertID}
 * - GSI2PK: ALERT#{Frequency}
 * - GSI2SK: {UserID}#{AlertID}
 *
 * DailySummary:
 * - PK: SUMMARY#{TickerID}
 * - SK: DATE#{Date}
 * - Type: DailySummary
 * - GSI4PK: {ExchangeID}
 * - GSI4SK: DATE#{Date}#{TickerID}
 */
export type DynamoDBItem = {
  /** パーティションキー - エンティティごとに異なる形式 */
  PK: string;
  /** ソートキー - エンティティごとに異なる形式 */
  SK: string;
  /** エンティティタイプ - データの種類を識別 */
  Type: 'Exchange' | 'Ticker' | 'Holding' | 'Alert' | 'DailySummary';
  /** GSI1 パーティションキー (ユーザーごとのデータ取得用) - Holding/Alertで使用 */
  GSI1PK?: string;
  /** GSI1 ソートキー - Holding/Alertで使用 */
  GSI1SK?: string;
  /** GSI2 パーティションキー (アラート頻度ごとの取得用) - Alertのみ使用 */
  GSI2PK?: string;
  /** GSI2 ソートキー - Alertのみ使用 */
  GSI2SK?: string;
  /** GSI3 パーティションキー (取引所ごとのティッカー一覧用) - Exchange(固定値)/Tickerで使用 */
  GSI3PK?: string;
  /** GSI3 ソートキー - Exchange/Tickerで使用 */
  GSI3SK?: string;
  /** GSI4 パーティションキー (取引所ごとの日次サマリー取得用) - DailySummaryのみ使用 */
  GSI4PK?: string;
  /** GSI4 ソートキー - DailySummaryのみ使用 */
  GSI4SK?: string;
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
  /** 保有平均価格（保有がある場合のみ） */
  holdingAveragePrice?: number;
};
