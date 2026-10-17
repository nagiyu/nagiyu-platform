/**
 * Stock Tracker Core - Type Definitions
 *
 * DynamoDB Single Table Design に基づくエンティティの型定義
 */

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
