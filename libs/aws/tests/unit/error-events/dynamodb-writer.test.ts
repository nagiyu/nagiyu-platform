/**
 * DynamoDBErrorEventWriter の単体テスト
 */

import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ErrorEvent } from '@nagiyu/common';
import { DynamoDBErrorEventWriter } from '../../../src/error-events/dynamodb-writer.js';
import {
  buildErrorEventPK,
  buildErrorEventSK,
  computeErrorEventTtl,
  ERROR_EVENT_ENTITY_TYPE,
  ERROR_EVENT_GSI1_PK,
} from '../../../src/error-events/writer.js';

const baseEvent: ErrorEvent = {
  eventId: 'evt-1',
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'stock-tracker-web-error-rate-prod (ALARM)',
  message: 'Threshold Crossed',
  context: '{"raw":true}',
  occurredAt: '2026-05-06T01:32:11.000Z',
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
    it('PutCommand を Single Table Design のキーで送信する', async () => {
      mockDocClient.send.mockResolvedValueOnce({} as never);

      await writer.put(baseEvent);

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const sentCommand = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(sentCommand).toBeInstanceOf(PutCommand);

      const input = sentCommand.input;
      expect(input.TableName).toBe('test-error-events');
      const expectedSk = buildErrorEventSK(baseEvent.occurredAt, baseEvent.eventId);
      expect(input.Item).toMatchObject({
        PK: buildErrorEventPK(baseEvent.serviceId),
        SK: expectedSk,
        Type: ERROR_EVENT_ENTITY_TYPE,
        GSI1PK: ERROR_EVENT_GSI1_PK,
        GSI1SK: expectedSk,
        eventId: baseEvent.eventId,
        serviceId: baseEvent.serviceId,
        source: baseEvent.source,
        severity: baseEvent.severity,
        title: baseEvent.title,
        message: baseEvent.message,
        context: baseEvent.context,
        occurredAt: baseEvent.occurredAt,
        ttl: computeErrorEventTtl(baseEvent.occurredAt),
      });
      expect(typeof input.Item?.CreatedAt).toBe('number');
      expect(typeof input.Item?.UpdatedAt).toBe('number');
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

    it('occurredAt が空の場合は例外を投げる', async () => {
      await expect(writer.put({ ...baseEvent, occurredAt: '' })).rejects.toThrow(
        'occurredAt は空文字にできません'
      );
    });

    it('title が空の場合は例外を投げる', async () => {
      await expect(writer.put({ ...baseEvent, title: '' })).rejects.toThrow(
        'title は空文字にできません'
      );
    });

    it('DynamoDB エラーはそのまま伝播する', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('AWS down'));

      await expect(writer.put(baseEvent)).rejects.toThrow('AWS down');
    });
  });
});
