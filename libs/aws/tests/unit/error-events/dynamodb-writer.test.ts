/**
 * DynamoDBErrorEventWriter の単体テスト
 */

import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ErrorEvent } from '@nagiyu/common';
import { DynamoDBErrorEventWriter } from '../../../src/error-events/dynamodb-writer.js';
import { EntityAlreadyExistsError } from '../../../src/dynamodb/errors.js';

const OCCURRED_AT = Date.parse('2026-05-06T01:32:11.000Z');

const baseEvent: ErrorEvent = {
  eventId: 'evt-1',
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'stock-tracker-web-error-rate-prod (ALARM)',
  message: 'Threshold Crossed',
  context: '{"raw":true}',
  occurredAt: OCCURRED_AT,
};

describe('DynamoDBErrorEventWriter', () => {
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  let writer: DynamoDBErrorEventWriter;

  beforeEach(() => {
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    writer = new DynamoDBErrorEventWriter(mockDocClient, 'test-error-events');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('put', () => {
    it('新形式の属性で、既存を上書きしない条件付き PutCommand を送信する', async () => {
      mockDocClient.send.mockResolvedValueOnce({} as never);

      await writer.put(baseEvent);

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const sentCommand = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(sentCommand).toBeInstanceOf(PutCommand);

      const input = sentCommand.input;
      expect(input.TableName).toBe('test-error-events');
      expect(input.ConditionExpression).toBe('attribute_not_exists(#pk)');
      const expectedSk = 'OCCURRED#2026-05-06T01:32:11.000Z#evt-1';
      expect(input.Item).toMatchObject({
        PK: 'ERROR_EVENT#stock-tracker',
        SK: expectedSk,
        Type: 'ErrorEvent',
        GSI1PK: 'ERROR_EVENT_ALL',
        GSI1SK: expectedSk,
        EventID: baseEvent.eventId,
        ServiceID: baseEvent.serviceId,
        Source: baseEvent.source,
        Severity: baseEvent.severity,
        Title: baseEvent.title,
        Message: baseEvent.message,
        Context: baseEvent.context,
        OccurredAt: OCCURRED_AT,
        TTL: Math.floor((OCCURRED_AT + 180 * 24 * 60 * 60 * 1000) / 1000),
      });
      expect(typeof input.Item?.CreatedAt).toBe('number');
      expect(typeof input.Item?.UpdatedAt).toBe('number');
      expect(input.Item).not.toHaveProperty('ttl');
      expect(input.Item).not.toHaveProperty('eventId');
    });

    it('eventId が空の場合は例外を投げる', async () => {
      await expect(writer.put({ ...baseEvent, eventId: '' })).rejects.toThrow(
        'eventId は空文字にできません'
      );
      expect(mockDocClient.send).not.toHaveBeenCalled();
    });

    it('serviceId が空の場合は例外を投げる', async () => {
      await expect(writer.put({ ...baseEvent, serviceId: '' })).rejects.toThrow(
        'serviceId は空文字にできません'
      );
    });

    it('occurredAt が日時として解釈できない場合は例外を投げる', async () => {
      await expect(writer.put({ ...baseEvent, occurredAt: Number.NaN })).rejects.toThrow(
        'occurredAt は有限の数値'
      );
      await expect(
        writer.put({ ...baseEvent, occurredAt: '2026-05-06' as unknown as number })
      ).rejects.toThrow('occurredAt は有限の数値');
      expect(mockDocClient.send).not.toHaveBeenCalled();
    });

    it('title が空の場合は例外を投げる', async () => {
      await expect(writer.put({ ...baseEvent, title: '' })).rejects.toThrow(
        'title は空文字にできません'
      );
    });

    it('同じキーが既にある場合は EntityAlreadyExistsError にする', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' })
      );

      await expect(writer.put(baseEvent)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('DynamoDB エラーは伝播する', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('AWS down'));

      await expect(writer.put(baseEvent)).rejects.toThrow('AWS down');
    });
  });
});
