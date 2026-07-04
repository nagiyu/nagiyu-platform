/**
 * alarm-ingest Lambda の単体テスト
 */

import { resetErrorEventWriter } from '@nagiyu/aws';
import {
  buildErrorEventFromSns,
  inferServiceIdFromAlarmName,
  handler,
  type AlarmIngestEvent,
} from '../../src/alarm-ingest.js';

const buildSnsRecord = (
  message: Record<string, unknown>,
  type = 'Notification'
): {
  EventSource: 'aws:sns';
  Sns: { Type: string; Subject?: string; Message: string; Timestamp: string };
} => ({
  EventSource: 'aws:sns',
  Sns: {
    Type: type,
    Message: JSON.stringify(message),
    Timestamp: '2026-05-06T01:00:00.000Z',
  },
});

describe('inferServiceIdFromAlarmName', () => {
  it('2 セグメント以上なら最初の 2 セグメントを連結する', () => {
    expect(inferServiceIdFromAlarmName('stock-tracker-web-error-rate-prod')).toBe('stock-tracker');
  });

  it('1 セグメントならそのまま返す', () => {
    expect(inferServiceIdFromAlarmName('admin')).toBe('admin');
  });

  it('空文字なら unknown', () => {
    expect(inferServiceIdFromAlarmName('')).toBe('unknown');
  });

  it('ハイフンだけなら unknown', () => {
    expect(inferServiceIdFromAlarmName('---')).toBe('unknown');
  });
});

describe('buildErrorEventFromSns', () => {
  it('ALARM 遷移の Notification を ErrorEvent に変換する', () => {
    const record = buildSnsRecord({
      AlarmName: 'stock-tracker-web-error-rate-prod',
      NewStateValue: 'ALARM',
      NewStateReason: 'Threshold Crossed: 0.6 > 0.05',
      StateChangeTime: '2026-05-06T01:32:11.123+0000',
    });

    const event = buildErrorEventFromSns(record);

    expect(event).not.toBeNull();
    expect(event!.serviceId).toBe('stock-tracker');
    expect(event!.severity).toBe('error');
    expect(event!.source).toBe('cloudwatch-alarm');
    expect(event!.title).toBe('stock-tracker-web-error-rate-prod (ALARM)');
    expect(event!.message).toBe('Threshold Crossed: 0.6 > 0.05');
    expect(event!.context).toBe(record.Sns.Message);
    expect(event!.eventId).toBeTruthy();
    expect(event!.occurredAt).toBe('2026-05-06T01:32:11.123Z');
  });

  it('OK 遷移は null を返す', () => {
    const record = buildSnsRecord({
      AlarmName: 'stock-tracker-web-error-rate-prod',
      NewStateValue: 'OK',
      NewStateReason: 'Recovered',
    });
    expect(buildErrorEventFromSns(record)).toBeNull();
  });

  it('SubscriptionConfirmation など Type が異なる場合は null', () => {
    const record = buildSnsRecord({}, 'SubscriptionConfirmation');
    expect(buildErrorEventFromSns(record)).toBeNull();
  });

  it('Message が JSON でないとき null', () => {
    const record = {
      EventSource: 'aws:sns' as const,
      Sns: {
        Type: 'Notification',
        Message: 'not-json-payload',
        Timestamp: '2026-05-06T01:00:00.000Z',
      },
    };
    expect(buildErrorEventFromSns(record)).toBeNull();
  });

  it('AlarmName が無いとき null', () => {
    const record = buildSnsRecord({
      NewStateValue: 'ALARM',
      NewStateReason: 'reason',
    });
    expect(buildErrorEventFromSns(record)).toBeNull();
  });

  it('StateChangeTime 不在のときは Sns.Timestamp を occurredAt に使う', () => {
    const record = buildSnsRecord({
      AlarmName: 'svc-component',
      NewStateValue: 'ALARM',
      NewStateReason: 'reason',
    });
    const event = buildErrorEventFromSns(record);
    expect(event!.occurredAt).toBe('2026-05-06T01:00:00.000Z');
  });

  describe('AWS Batch Job State Change イベント', () => {
    const buildBatchEventMessage = (
      overrides: Partial<{
        status: string;
        jobName: string;
        statusReason: string;
        time: string;
      }> = {}
    ) => ({
      version: '0',
      'detail-type': 'Batch Job State Change',
      source: 'aws.batch',
      time: overrides.time ?? '2026-07-03T13:19:38Z',
      region: 'us-east-1',
      detail: {
        jobArn: 'arn:aws:batch:us-east-1:111122223333:job/xxx',
        jobName: overrides.jobName ?? 'quick-clip-extract-4f8920ea-7486-49a6-911e-e16706ecf605',
        jobId: '73a81949-daa3-413f-bca8-78c6b61e193c',
        jobQueue: 'arn:aws:batch:us-east-1:111122223333:job-queue/nagiyu-quick-clip-dev',
        status: overrides.status ?? 'FAILED',
        statusReason: overrides.statusReason ?? 'Job attempt duration exceeded timeout',
        jobDefinition: 'arn:aws:batch:...:job-definition/nagiyu-quick-clip-dev-small:10',
      },
    });

    it('status=FAILED の Batch イベントを ErrorEvent に変換する', () => {
      const record = buildSnsRecord(buildBatchEventMessage());

      const event = buildErrorEventFromSns(record);

      expect(event).not.toBeNull();
      expect(event!.serviceId).toBe('quick-clip');
      expect(event!.severity).toBe('error');
      expect(event!.source).toBe('batch-event');
      expect(event!.title).toBe(
        'AWS Batch ジョブ失敗: quick-clip-extract-4f8920ea-7486-49a6-911e-e16706ecf605'
      );
      expect(event!.message).toBe('Job attempt duration exceeded timeout');
      expect(event!.context).toBe(record.Sns.Message);
      expect(event!.eventId).toBeTruthy();
      expect(event!.occurredAt).toBe('2026-07-03T13:19:38.000Z');
    });

    it('status=SUCCEEDED の Batch イベントは null を返す', () => {
      const record = buildSnsRecord(buildBatchEventMessage({ status: 'SUCCEEDED' }));
      expect(buildErrorEventFromSns(record)).toBeNull();
    });

    it('status=RUNNING の Batch イベントは null を返す', () => {
      const record = buildSnsRecord(buildBatchEventMessage({ status: 'RUNNING' }));
      expect(buildErrorEventFromSns(record)).toBeNull();
    });

    it('time が無いときは Sns.Timestamp を occurredAt に使う', () => {
      const message = buildBatchEventMessage();
      delete (message as { time?: string }).time;
      const record = buildSnsRecord(message);

      const event = buildErrorEventFromSns(record);

      expect(event!.occurredAt).toBe('2026-05-06T01:00:00.000Z');
    });

    it('jobName が無いときは serviceId が unknown になり例外を投げない', () => {
      const message = buildBatchEventMessage();
      delete (message.detail as { jobName?: string }).jobName;
      const record = buildSnsRecord(message);

      const event = buildErrorEventFromSns(record);

      expect(event).not.toBeNull();
      expect(event!.serviceId).toBe('unknown');
      expect(event!.title).toBe('AWS Batch ジョブ失敗');
    });
  });
});

describe('handler', () => {
  const originalEnv = process.env.USE_IN_MEMORY_DB;
  const originalTable = process.env.ERROR_EVENTS_TABLE_NAME;

  beforeEach(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = 'test-error-events';
    resetErrorEventWriter();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
    } else {
      process.env.USE_IN_MEMORY_DB = originalEnv;
    }
    if (originalTable === undefined) {
      delete process.env.ERROR_EVENTS_TABLE_NAME;
    } else {
      process.env.ERROR_EVENTS_TABLE_NAME = originalTable;
    }
    resetErrorEventWriter();
  });

  it('ALARM 通知 1 件 → processed=1', async () => {
    const event: AlarmIngestEvent = {
      Records: [
        buildSnsRecord({
          AlarmName: 'stock-tracker-web-error-rate-prod',
          NewStateValue: 'ALARM',
          NewStateReason: 'Threshold',
          StateChangeTime: '2026-05-06T01:00:00Z',
        }),
      ],
    };

    const result = await handler(event);
    expect(result).toEqual({ processed: 1, skipped: 0 });
  });

  it('OK 通知は skip', async () => {
    const event: AlarmIngestEvent = {
      Records: [
        buildSnsRecord({
          AlarmName: 'stock-tracker-web-error-rate-prod',
          NewStateValue: 'OK',
          NewStateReason: 'Recovered',
        }),
      ],
    };

    const result = await handler(event);
    expect(result).toEqual({ processed: 0, skipped: 1 });
  });

  it('複数レコードが混在する場合、ALARM のみ processed', async () => {
    const event: AlarmIngestEvent = {
      Records: [
        buildSnsRecord({
          AlarmName: 'stock-tracker-web-error-rate-prod',
          NewStateValue: 'ALARM',
          NewStateReason: 'Threshold',
        }),
        buildSnsRecord({
          AlarmName: 'stock-tracker-web-error-rate-prod',
          NewStateValue: 'OK',
          NewStateReason: 'Recovered',
        }),
      ],
    };

    const result = await handler(event);
    expect(result).toEqual({ processed: 1, skipped: 1 });
  });

  it('Records が空でもエラーにならない', async () => {
    const result = await handler({ Records: [] });
    expect(result).toEqual({ processed: 0, skipped: 0 });
  });

  it('ERROR_EVENTS_TABLE_NAME 未設定で例外を投げる', async () => {
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    delete process.env.USE_IN_MEMORY_DB;
    resetErrorEventWriter();

    await expect(
      handler({ Records: [buildSnsRecord({ NewStateValue: 'ALARM' })] })
    ).rejects.toThrow('ERROR_EVENTS_TABLE_NAME が設定されていません');
  });

  it('Batch ジョブ失敗イベント 1 件 → processed=1', async () => {
    const event: AlarmIngestEvent = {
      Records: [
        buildSnsRecord({
          'detail-type': 'Batch Job State Change',
          source: 'aws.batch',
          time: '2026-07-03T13:19:38Z',
          detail: {
            jobName: 'quick-clip-extract-4f8920ea-7486-49a6-911e-e16706ecf605',
            status: 'FAILED',
            statusReason: 'Job attempt duration exceeded timeout',
          },
        }),
      ],
    };

    const result = await handler(event);
    expect(result).toEqual({ processed: 1, skipped: 0 });
  });

  it('Batch イベントと CloudWatch Alarm が混在する場合、両方 processed', async () => {
    const event: AlarmIngestEvent = {
      Records: [
        buildSnsRecord({
          'detail-type': 'Batch Job State Change',
          source: 'aws.batch',
          time: '2026-07-03T13:19:38Z',
          detail: {
            jobName: 'quick-clip-extract-4f8920ea',
            status: 'FAILED',
            statusReason: 'Job attempt duration exceeded timeout',
          },
        }),
        buildSnsRecord({
          AlarmName: 'stock-tracker-web-error-rate-prod',
          NewStateValue: 'ALARM',
          NewStateReason: 'Threshold',
        }),
      ],
    };

    const result = await handler(event);
    expect(result).toEqual({ processed: 2, skipped: 0 });
  });

  it('aws:sns 以外のイベントソースは skip', async () => {
    const event: AlarmIngestEvent = {
      Records: [
        {
          EventSource: 'aws:sqs' as 'aws:sns',
          Sns: { Type: 'Notification', Message: '{}', Timestamp: '2026-05-06T01:00:00Z' },
        },
      ],
    };
    const result = await handler(event);
    expect(result).toEqual({ processed: 0, skipped: 1 });
  });
});
