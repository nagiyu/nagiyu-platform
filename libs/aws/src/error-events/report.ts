/**
 * アプリケーション層から Admin に ErrorEvent を報告するユーティリティ
 *
 * `source: 'application'` や `source: 'manual'` のイベントを DynamoDB に書き込む。
 * CloudWatch Alarm 由来の取り込みには alarm-ingest を使用すること。
 */

import {
  generateEventId,
  type ErrorEvent,
  type ErrorSeverity,
  type ErrorSource,
} from '@nagiyu/common';
import { getDynamoDBDocumentClient } from '../dynamodb/index.js';
import { createErrorEventWriter } from './factory.js';

const ERROR_MESSAGES = {
  ERROR_EVENTS_TABLE_NAME_REQUIRED: 'ERROR_EVENTS_TABLE_NAME が設定されていません',
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
  /** デフォルト: 呼び出し時点の UTC ISO-8601 */
  occurredAt?: string;
  /** デフォルト: UUID v4 自動採番 */
  eventId?: string;
}

/**
 * ErrorEvent を DynamoDB に書き込み、書き込んだイベントを返す。
 *
 * - `ERROR_EVENTS_TABLE_NAME` 環境変数が未設定の場合は例外を投げる
 * - 書き込み失敗は呼び出し元に伝播する（無音失敗しない）
 */
export async function reportErrorEvent(input: ReportErrorEventInput): Promise<ErrorEvent> {
  const tableName = process.env.ERROR_EVENTS_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.ERROR_EVENTS_TABLE_NAME_REQUIRED);
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
    context: input.context !== undefined ? JSON.stringify(input.context) : '{}',
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };

  await writer.put(event);
  return event;
}

export interface ErrorReporter {
  report: (
    input: Omit<ReportErrorEventInput, 'serviceId'> & { serviceId?: string }
  ) => Promise<ErrorEvent>;
}

/**
 * serviceId を固定したレポーターを生成する。
 *
 * サービス・バッチごとに `serviceId` を毎回指定する手間を省く。
 * 個別呼び出しで `serviceId` を渡した場合はそちらを優先する。
 *
 * @example
 * const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
 * await reporter.report({ severity: 'error', title: '...', message: '...' });
 */
export function createErrorReporter(defaults: { serviceId: string }): ErrorReporter {
  return {
    report: (input) =>
      reportErrorEvent({
        ...input,
        serviceId: input.serviceId ?? defaults.serviceId,
      }),
  };
}
