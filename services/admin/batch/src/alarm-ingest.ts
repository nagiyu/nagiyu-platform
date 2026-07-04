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

/**
 * AWS Batch Job State Change イベント（EventBridge → SNS 経由）の detail 部分
 */
type BatchJobStateChangeDetail = {
  jobArn?: string;
  jobName?: string;
  jobId?: string;
  status?: string;
  statusReason?: string;
  jobQueue?: string;
};

/**
 * EventBridge から SNS 経由で届く汎用イベント本文（Batch Job State Change を含む）
 */
type EventBridgeEventPayload = {
  'detail-type'?: string;
  source?: string;
  time?: string;
  detail?: BatchJobStateChangeDetail;
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
 * AWS Batch Job State Change イベント（EventBridge 経由）を ErrorEvent に変換する。
 *
 * プロセスの生死に依存しない検知経路（EventBridge → SNS）のため、タイムアウトによる
 * SIGKILL のようにアプリ内 try/catch が走らないケースも拾える「安全網」として機能する。
 * serviceId は jobName から汎用的に導出し、特定サービス固有の分岐は持たない。
 * FAILED 以外（SUCCEEDED 等）は集約対象外として null を返す。
 */
function buildErrorEventFromBatchEvent(
  record: SnsRecord,
  payload: EventBridgeEventPayload
): ErrorEvent | null {
  const detail = payload.detail ?? {};

  if (detail.status !== 'FAILED') {
    return null;
  }

  const serviceId = inferServiceIdFromAlarmName(detail.jobName ?? '');
  const occurredAt = payload.time
    ? new Date(payload.time).toISOString()
    : new Date(record.Sns.Timestamp).toISOString();

  return {
    eventId: generateEventId(),
    serviceId,
    source: 'batch-event',
    severity: 'error',
    title: detail.jobName ? `AWS Batch ジョブ失敗: ${detail.jobName}` : 'AWS Batch ジョブ失敗',
    message: detail.statusReason ?? '',
    context: record.Sns.Message,
    occurredAt,
  };
}

/**
 * ALARM 遷移の SNS Notification を ErrorEvent に変換する。
 * 対象外（OK 通知 / 解析不能）の場合は null を返す。
 */
export function buildErrorEventFromSns(record: SnsRecord): ErrorEvent | null {
  if (record.Sns.Type !== 'Notification') {
    return null;
  }

  let payload: CloudWatchAlarmPayload & EventBridgeEventPayload;
  try {
    payload = JSON.parse(record.Sns.Message) as CloudWatchAlarmPayload & EventBridgeEventPayload;
  } catch {
    return null;
  }

  // AWS Batch Job State Change（EventBridge 経由）は専用ロジックに分岐する
  if (payload['detail-type'] === 'Batch Job State Change' && payload.source === 'aws.batch') {
    return buildErrorEventFromBatchEvent(record, payload);
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
