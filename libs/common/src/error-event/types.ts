/**
 * ErrorEvent ドメイン型定義
 *
 * プラットフォーム上で発生したエラー通知を表す共通型。
 * フレームワーク非依存。
 */

/**
 * エラーの重大度
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * エラーの発生源種別
 *
 * - `cloudwatch-alarm`: CloudWatch Alarm 由来（SNS 経由で取り込まれる）
 * - `application`: アプリケーション層からの直接レポート（将来拡張）
 * - `manual`: 運用者による手動投入（将来拡張）
 */
export type ErrorSource = 'cloudwatch-alarm' | 'application' | 'manual';

/**
 * 永続化される 1 件のエラーイベント
 */
export type ErrorEvent = {
  /** イベントの一意識別子 */
  eventId: string;
  /** 発生元サービス ID（例: stock-tracker） */
  serviceId: string;
  /** 発生源種別 */
  source: ErrorSource;
  /** 重大度 */
  severity: ErrorSeverity;
  /** 一覧表示用の見出し */
  title: string;
  /** 詳細本文 */
  message: string;
  /** 生ペイロードを保持する JSON 文字列 */
  context: string;
  /** 発生時刻（ISO-8601 UTC） */
  occurredAt: string;
};
