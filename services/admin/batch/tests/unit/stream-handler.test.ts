/**
 * stream-handler Lambda の単体テスト
 */

import { marshall } from '@aws-sdk/util-dynamodb';
import type { ErrorEvent } from '@nagiyu/common';
import { resetPushSubscriptionRepository } from '@nagiyu/admin-core';
import {
  buildPushPayload,
  unmarshallErrorEvent,
  handler,
  type StreamHandlerEvent,
} from '../../src/stream-handler.js';

const sampleEvent: ErrorEvent = {
  eventId: 'evt-1',
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'sample-alarm (ALARM)',
  message: 'Threshold Crossed',
  context: '{}',
  occurredAt: '2026-05-06T01:00:00.000Z',
};

const buildStreamRecord = (
  errorEvent: ErrorEvent | null,
  eventName: 'INSERT' | 'MODIFY' | 'REMOVE' = 'INSERT'
) => ({
  eventName,
  dynamodb: errorEvent
    ? {
        NewImage: marshall({
          ...errorEvent,
          PK: `ERROR_EVENT#${errorEvent.serviceId}`,
          SK: `OCCURRED#${errorEvent.occurredAt}#${errorEvent.eventId}`,
          ttl: 1234567890,
        }),
      }
    : undefined,
});

describe('unmarshallErrorEvent', () => {
  it('正常な NewImage を ErrorEvent に変換する', () => {
    const newImage = marshall({
      ...sampleEvent,
      PK: 'ERROR_EVENT#stock-tracker',
      SK: 'OCCURRED#2026-05-06T01:00:00.000Z#evt-1',
    });

    const result = unmarshallErrorEvent(newImage as Record<string, unknown>);

    expect(result).toEqual(sampleEvent);
  });

  it('必須フィールドが無いと null', () => {
    const newImage = marshall({ eventId: 'x' });
    expect(unmarshallErrorEvent(newImage as Record<string, unknown>)).toBeNull();
  });

  it('severity が不正なら null', () => {
    const newImage = marshall({ ...sampleEvent, severity: 'unknown-severity' });
    expect(unmarshallErrorEvent(newImage as Record<string, unknown>)).toBeNull();
  });

  it('source が不正なら null', () => {
    const newImage = marshall({ ...sampleEvent, source: 'invalid-source' });
    expect(unmarshallErrorEvent(newImage as Record<string, unknown>)).toBeNull();
  });
});

describe('buildPushPayload', () => {
  it('title / body / icon / data.url を持つ payload を返す', () => {
    const payload = buildPushPayload(sampleEvent, 'https://admin.example.com');

    expect(payload.title).toBe(sampleEvent.title);
    expect(payload.body).toBe(sampleEvent.message);
    expect(payload.icon).toBe('/icon-192x192.png');
    expect(payload.data?.url).toBe(
      'https://admin.example.com/errors/evt-1?at=2026-05-06T01%3A00%3A00.000Z&serviceId=stock-tracker'
    );
    expect(payload.data?.eventId).toBe('evt-1');
    expect(payload.data?.tag).toBe('evt-1');
  });

  it('appUrl が空文字なら相対パスで data.url を生成する', () => {
    const payload = buildPushPayload(sampleEvent, '');
    expect(payload.data?.url).toBe(
      '/errors/evt-1?at=2026-05-06T01%3A00%3A00.000Z&serviceId=stock-tracker'
    );
  });

  it('message が空でもデフォルト本文を入れる', () => {
    const payload = buildPushPayload({ ...sampleEvent, message: '' }, 'https://x');
    expect(payload.body).toBe('エラー通知を受信しました');
  });
});

describe('handler', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.USE_IN_MEMORY_DB = process.env.USE_IN_MEMORY_DB;
    originalEnv.DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
    originalEnv.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
    originalEnv.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
    originalEnv.APP_URL = process.env.APP_URL;

    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.DYNAMODB_TABLE_NAME = 'admin-table';
    process.env.VAPID_PUBLIC_KEY = 'public';
    process.env.VAPID_PRIVATE_KEY = 'private';
    process.env.APP_URL = 'https://admin.example.com';
    resetPushSubscriptionRepository();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetPushSubscriptionRepository();
  });

  it('INSERT イベント 1 件 → notified=1', async () => {
    const event: StreamHandlerEvent = {
      Records: [buildStreamRecord(sampleEvent)],
    };
    const result = await handler(event);
    expect(result).toEqual({ notified: 1, skipped: 0 });
  });

  it('MODIFY と REMOVE は skip', async () => {
    const event: StreamHandlerEvent = {
      Records: [
        buildStreamRecord(sampleEvent, 'MODIFY'),
        buildStreamRecord(sampleEvent, 'REMOVE'),
      ],
    };
    const result = await handler(event);
    expect(result).toEqual({ notified: 0, skipped: 2 });
  });

  it('NewImage が無いと skip', async () => {
    const event: StreamHandlerEvent = {
      Records: [{ eventName: 'INSERT' }],
    };
    const result = await handler(event);
    expect(result).toEqual({ notified: 0, skipped: 1 });
  });

  it('VAPID キー未設定で例外', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    await expect(
      handler({ Records: [buildStreamRecord(sampleEvent)] })
    ).rejects.toThrow('VAPID キーが設定されていません');
  });

  it('APP_URL 未設定で例外', async () => {
    delete process.env.APP_URL;
    await expect(
      handler({ Records: [buildStreamRecord(sampleEvent)] })
    ).rejects.toThrow('APP_URL が設定されていません');
  });
});
