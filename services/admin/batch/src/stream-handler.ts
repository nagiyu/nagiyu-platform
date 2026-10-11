/**
 * stream-handler Lambda Handler
 *
 * error-events DynamoDB Streams を受け、INSERT イベントごとに
 * Web Push を全購読者へ fan-out する。
 *
 * - MODIFY / REMOVE は無視
 * - Push 送信は既存の WebPushSender を流用（購読は admin の DynamoDB にある）
 * - data.url は `/errors/{eventId}?at={occurredAt}&serviceId={serviceId}` を指す
 */

import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { ErrorEvent } from '@nagiyu/common';
import { getDynamoDBDocumentClient, parseErrorEventItem } from '@nagiyu/aws';
import {
  createPushSubscriptionRepository,
  WebPushSender,
  type PushNotificationPayload,
} from '@nagiyu/admin-core';

const ERROR_MESSAGES = {
  ADMIN_DYNAMODB_TABLE_NAME_REQUIRED: 'DYNAMODB_TABLE_NAME が設定されていません',
  APP_URL_REQUIRED: 'APP_URL が設定されていません',
} as const;

/**
 * DynamoDB Streams Event の最小定義
 */
type StreamRecord = {
  eventName: 'INSERT' | 'MODIFY' | 'REMOVE';
  dynamodb?: {
    NewImage?: Record<string, unknown>;
  };
};

export type StreamHandlerEvent = {
  Records: StreamRecord[];
};

export type HandlerResponse = {
  notified: number;
  skipped: number;
};

function getSubscriptionRepository() {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.ADMIN_DYNAMODB_TABLE_NAME_REQUIRED);
  }
  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  return createPushSubscriptionRepository(docClient, tableName);
}

function getWebPushSender(): WebPushSender {
  return new WebPushSender({ repository: getSubscriptionRepository() });
}

/**
 * Streams の NewImage（DynamoDB AttributeValue 形式）から ErrorEvent を復元する。
 *
 * @throws 必須フィールドが欠けている・値が不正な場合。読み飛ばすと無音になるため、
 *   例外にして Lambda の Errors アラームで検知できるようにする。
 */
export function unmarshallErrorEvent(newImage: Record<string, unknown>): ErrorEvent {
  return parseErrorEventItem(unmarshall(newImage as Parameters<typeof unmarshall>[0]));
}

/**
 * ErrorEvent から Web Push の Payload を組み立てる。
 */
export function buildPushPayload(event: ErrorEvent, appUrl: string): PushNotificationPayload {
  const params = new URLSearchParams({
    at: event.occurredAt,
    serviceId: event.serviceId,
  });
  const detailPath = `/errors/${encodeURIComponent(event.eventId)}?${params.toString()}`;
  const url = appUrl ? `${appUrl}${detailPath}` : detailPath;

  return {
    title: event.title,
    body: event.message || 'エラー通知を受信しました',
    icon: '/icon-192x192.png',
    data: {
      url,
      eventId: event.eventId,
      tag: event.eventId,
    },
  };
}

/**
 * Lambda エントリポイント。
 */
export async function handler(event: StreamHandlerEvent): Promise<HandlerResponse> {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error(ERROR_MESSAGES.APP_URL_REQUIRED);
  }

  const sender = getWebPushSender();

  let notified = 0;
  let skipped = 0;

  for (const record of event.Records ?? []) {
    if (record.eventName !== 'INSERT') {
      skipped += 1;
      continue;
    }
    const newImage = record.dynamodb?.NewImage;
    if (!newImage) {
      skipped += 1;
      continue;
    }
    const errorEvent = unmarshallErrorEvent(newImage);

    const payload = buildPushPayload(errorEvent, appUrl);
    await sender.sendAll(payload);
    notified += 1;
  }

  return { notified, skipped };
}
