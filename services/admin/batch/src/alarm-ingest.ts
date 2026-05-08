/**
 * alarm-ingest Lambda Handler
 *
 * SNS 経由で届いた CloudWatch Alarm 通知を ErrorEvent として
 * DynamoDB（error-events テーブル）に永続化する。
 *
 * 後段では DynamoDB Streams が起動して stream-handler が
 * Web Push を発火する（このハンドラ自身は Push を送らない）。
 */

import { generateEventId, type ErrorEvent, type ErrorSeverity } from '@nagiyu/common';
import { getDynamoDBDocumentClient, createErrorEventWriter } from '@nagiyu/aws';

const ERROR_MESSAGES = {
  ERROR_EVENTS_TABLE_NAME_REQUIRED: 'ERROR_EVENTS_TABLE_NAME が設定されていません',
} as const;

/**
 * SNS Lambda Event の Record（必要な部分のみ）
 */
type SnsRecord = {
  EventSource: 'aws:sns';
  Sns: {
    Type: string;
    Subject?: string;
    Message: string;
    Timestamp: string;
  };
};

/**
 * Lambda が受け取る SNS イベント
 */
export type AlarmIngestEvent = {
  Records: SnsRecord[];
};

export type HandlerResponse = {
  processed: number;
  skipped: number;
};

/**
 * CloudWatch Alarm の SNS メッセージ本文形式
 */
type CloudWatchAlarmPayload = {
  AlarmName?: string;
  AlarmDescription?: string;
  NewStateValue?: string;
  NewStateReason?: string;
  StateChangeTime?: string;
  Region?: string;
  AlarmArn?: string;
};

function getWriter() {
  const tableName = process.env.ERROR_EVENTS_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.ERROR_EVENTS_TABLE_NAME_REQUIRED);
  }
  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  return createErrorEventWriter(docClient, tableName);
}

/**
 * AlarmName からサービス ID を推定する。
 *
 * 既存の命名規約 `{service}-{component}-{metric}-{env}` を前提に、
 * 先頭 2 セグメント（例: `stock-tracker`）を抽出する。
 * 該当しない場合は最初のセグメントを返し、それも空なら 'unknown'。
 */
export function inferServiceIdFromAlarmName(alarmName: string): string {
  if (!alarmName) {
    return 'unknown';
  }
  const segments = alarmName.split('-').filter((s) => s.length > 0);
  if (segments.length === 0) {
    return 'unknown';
  }
  if (segments.length >= 2) {
    return `${segments[0]}-${segments[1]}`;
  }
  return segments[0];
}

/**
 * CloudWatch Alarm から重大度を推定する。
 * CloudWatch Alarm 自体には severity の概念がないため、
 * 今回は一律 `error` とする（将来 AlarmDescription などからの推定に拡張する）。
 */
export function inferSeverityFromAlarm(): ErrorSeverity {
  return 'error';
}

/**
 * ALARM 遷移の SNS Notification を ErrorEvent に変換する。
 * 対象外（OK 通知 / 解析不能）の場合は null を返す。
 */
export function buildErrorEventFromSns(record: SnsRecord): ErrorEvent | null {
  if (record.Sns.Type !== 'Notification') {
    return null;
  }

  let payload: CloudWatchAlarmPayload;
  try {
    payload = JSON.parse(record.Sns.Message) as CloudWatchAlarmPayload;
  } catch {
    return null;
  }

  // OK / INSUFFICIENT_DATA は Phase 1 では永続化しない
  if (payload.NewStateValue !== 'ALARM') {
    return null;
  }

  if (!payload.AlarmName) {
    return null;
  }

  const serviceId = inferServiceIdFromAlarmName(payload.AlarmName);
  const occurredAt = payload.StateChangeTime
    ? new Date(payload.StateChangeTime).toISOString()
    : new Date(record.Sns.Timestamp).toISOString();

  return {
    eventId: generateEventId(),
    serviceId,
    source: 'cloudwatch-alarm',
    severity: inferSeverityFromAlarm(),
    title: `${payload.AlarmName} (${payload.NewStateValue})`,
    message: payload.NewStateReason ?? '',
    context: record.Sns.Message,
    occurredAt,
  };
}

/**
 * Lambda エントリポイント。
 */
export async function handler(event: AlarmIngestEvent): Promise<HandlerResponse> {
  const writer = getWriter();

  let processed = 0;
  let skipped = 0;

  for (const record of event.Records ?? []) {
    if (record.EventSource !== 'aws:sns') {
      skipped += 1;
      continue;
    }
    const errorEvent = buildErrorEventFromSns(record);
    if (!errorEvent) {
      skipped += 1;
      continue;
    }
    await writer.put(errorEvent);
    processed += 1;
  }

  return { processed, skipped };
}
