/**
 * ErrorEvent ドメイン型定義
 *
 * プラットフォーム上で発生したエラー通知を表す共通型。
 * フレームワーク非依存。
 */

/**
 * エラーの重大度の一覧
 *
 * 保存データの検証と型の導出を同じ定義から行うため、値は一覧として持つ。
 */
export const ERROR_SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;

/**
 * エラーの重大度
 */
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

/**
 * エラーの発生源種別の一覧
 *
 * 保存データの検証と型の導出を同じ定義から行うため、値は一覧として持つ。
 */
export const ERROR_SOURCES = ['cloudwatch-alarm', 'application', 'manual', 'batch-event'] as const;

/**
 * エラーの発生源種別
 *
 * - `cloudwatch-alarm`: CloudWatch Alarm 由来（SNS 経由で取り込まれる）
 * - `application`: アプリケーション層からの直接レポート（将来拡張）
 * - `manual`: 運用者による手動投入（将来拡張）
 * - `batch-event`: AWS のイベント由来（EventBridge 経由の Batch Job State Change 等、プロセスの生死に依存しない検知）
 */
export type ErrorSource = (typeof ERROR_SOURCES)[number];

/**
 * 値が ErrorSeverity かを判定する型ガード。
 */
export function isErrorSeverity(value: unknown): value is ErrorSeverity {
  return typeof value === 'string' && (ERROR_SEVERITIES as readonly string[]).includes(value);
}

/**
 * 値が ErrorSource かを判定する型ガード。
 */
export function isErrorSource(value: unknown): value is ErrorSource {
  return typeof value === 'string' && (ERROR_SOURCES as readonly string[]).includes(value);
}

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
