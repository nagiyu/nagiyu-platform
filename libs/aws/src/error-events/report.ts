/**
 * アプリケーション層から Admin に ErrorEvent を報告するユーティリティ
 *
 * `source: 'application'` や `source: 'manual'` のイベントを DynamoDB に書き込む。
 * CloudWatch Alarm 由来の取り込みには alarm-ingest を使用すること。
 *
 * 書き込み失敗時は例外を呼び出し元に伝播させず、logger.error で警告して null を返す。
 * 書き込みは補助的なログ手段であり、アプリ本処理を巻き込まないことを優先する。
 */

import {
  buildErrorContext,
  generateEventId,
  logger,
  toErrorMessage,
  type ErrorEvent,
  type ErrorSeverity,
  type ErrorSource,
} from '@nagiyu/common';
import { getDynamoDBDocumentClient } from '../dynamodb/index.js';
import { createErrorEventWriter } from './factory.js';

const ERROR_MESSAGES = {
  ERROR_EVENTS_TABLE_NAME_REQUIRED: 'ERROR_EVENTS_TABLE_NAME が設定されていません',
  CONTEXT_SERIALIZE_FAILED:
    '[reportErrorEvent] context のシリアライズに失敗したため代替値で報告します',
  WRITE_FAILED: '[reportErrorEvent] DynamoDB 書き込みに失敗しました',
  INVALID_OCCURRED_AT: 'occurredAt が日時として解釈できません',
} as const;

export interface ReportErrorEventInput {
  serviceId: string;
  severity: ErrorSeverity;
  title: string;
  message: string;
  /** デフォルト: 'application' */
  source?: ErrorSource;
  /** 任意の補足情報。JSON にシリアライズして保存する */
  context?: Record<string, unknown>;
  /** ISO-8601 文字列または epoch ミリ秒。デフォルト: 呼び出し時点 */
  occurredAt?: string | number;
  /** デフォルト: UUID v4 自動採番 */
  eventId?: string;
}

/**
 * ErrorEvent を DynamoDB に書き込み、書き込んだイベントを返す。
 *
 * - `ERROR_EVENTS_TABLE_NAME` 環境変数が未設定の場合は logger.error で警告して null を返す
 * - 書き込み失敗時も logger.error で警告して null を返す（例外は投げない）
 * - context がシリアライズできない場合は代替 JSON で報告を続ける
 */
export async function reportErrorEvent(input: ReportErrorEventInput): Promise<ErrorEvent | null> {
  try {
    const tableName = process.env.ERROR_EVENTS_TABLE_NAME;
    if (!tableName) {
      logger.error(ERROR_MESSAGES.ERROR_EVENTS_TABLE_NAME_REQUIRED);
      return null;
    }

    const docClient =
      process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
    const writer = createErrorEventWriter(docClient, tableName);

    const event: ErrorEvent = {
      eventId: input.eventId ?? generateEventId(),
      serviceId: input.serviceId,
      source: input.source ?? 'application',
      severity: input.severity,
      title: input.title,
      message: input.message,
      context: serializeContext(input.context),
      occurredAt: resolveOccurredAt(input.occurredAt),
    };

    await writer.put(event);
    return event;
  } catch (error) {
    logger.error(ERROR_MESSAGES.WRITE_FAILED, {
      error: toErrorMessage(error),
    });
    return null;
  }
}

/**
 * 呼び出し側が渡した発生時刻を epoch ミリ秒にする。
 *
 * 呼び出し側 (別サービス) は ISO 文字列で渡すため、保存形式のミリ秒への変換はここで行う。
 *
 * @throws Error 日時として解釈できないとき
 */
function resolveOccurredAt(occurredAt: string | number | undefined): number {
  if (occurredAt === undefined) {
    return Date.now();
  }
  const millis = typeof occurredAt === 'number' ? occurredAt : Date.parse(occurredAt);
  if (Number.isNaN(new Date(millis).getTime())) {
    throw new Error(`${ERROR_MESSAGES.INVALID_OCCURRED_AT}: ${occurredAt}`);
  }
  return millis;
}

/**
 * context を JSON 文字列にする。
 *
 * 循環参照や BigInt を含む context でも報告自体は諦めず、
 * シリアライズ失敗を示す代替 JSON を保存して原因調査の手掛かりを残す。
 */
function serializeContext(context: Record<string, unknown> | undefined): string {
  if (context === undefined) {
    return '{}';
  }
  try {
    return JSON.stringify(context);
  } catch (error) {
    logger.error(ERROR_MESSAGES.CONTEXT_SERIALIZE_FAILED, {
      error: toErrorMessage(error),
    });
    return JSON.stringify({ contextSerializeError: toErrorMessage(error) });
  }
}

/** `ErrorReporter.report` の任意指定 */
export interface ReportOptions {
  /** 報告に添える補足情報。例外から組み立てる項目より先に展開するため、同名キーは例外側が勝つ */
  context?: Record<string, unknown>;
  /** デフォルト: 'error' */
  severity?: ErrorSeverity;
  /** デフォルト: 例外のメッセージ */
  message?: string;
}

export interface ErrorReporter {
  report: (title: string, error: unknown, options?: ReportOptions) => Promise<ErrorEvent | null>;
  onError: (title: string) => (error: unknown) => Promise<void>;
}

/**
 * serviceId を固定した、例外の報告用レポーターを生成する。
 *
 * 例外を握りつぶして処理を続ける箇所や、ルートファクトリの onError から、その場で報告する用途を想定する。
 * 例外を最後に受け止める層 (ルート入口・Lambda エントリ) は withApiErrorReporting や
 * createScheduledHandler などの骨格が報告するので、そこで重ねて呼ばない。
 * context の `errorName` / `errorMessage` / `errorStack` は例外から自動で入る。
 *
 * @example
 * const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
 * await reporter.report('タイトル', error, { context: { market }, severity: 'warning' });
 * // ルートファクトリに渡す onError
 * onError: reporter.onError('Push 購読の登録に失敗しました'),
 */
export function createErrorReporter(defaults: { serviceId: string }): ErrorReporter {
  const report: ErrorReporter['report'] = (title, error, options = {}) =>
    // reportErrorEvent は例外を投げないので try/catch は不要
    reportErrorEvent({
      serviceId: defaults.serviceId,
      severity: options.severity ?? 'error',
      title,
      message: options.message ?? toErrorMessage(error),
      context: { ...options.context, ...buildErrorContext(error) },
    });

  return {
    report,
    onError: (title) => async (error) => {
      await report(title, error);
    },
  };
}
