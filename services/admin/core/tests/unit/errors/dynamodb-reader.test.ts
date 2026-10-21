/**
 * DynamoDBErrorEventReader の単体テスト
 */

import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ErrorEvent } from '@nagiyu/common';
import { ErrorEventMapper, ERROR_EVENT_GSI1_PK } from '@nagiyu/aws';
import { DynamoDBErrorEventReader } from '../../../src/errors/dynamodb-reader.js';
import { encodeCursor } from '../../../src/errors/reader.js';

const sampleEvent: ErrorEvent = {
  eventId: 'evt-1',
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'sample',
  message: 'sample',
  context: '{}',
  occurredAt: Date.parse('2026-05-06T00:00:00.000Z'),
};

const mapper = new ErrorEventMapper();

const itemFor = (event: ErrorEvent): Record<string, unknown> => mapper.toItem(event);

describe('DynamoDBErrorEventReader', () => {
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  let reader: DynamoDBErrorEventReader;

  beforeEach(() => {
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    reader = new DynamoDBErrorEventReader(mockDocClient, 'test-error-events');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('serviceId 未指定なら GSI1 にクエリし、全件横断する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [itemFor(sampleEvent)] } as never);

      const result = await reader.list({});

      const cmd = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(cmd.input.IndexName).toBe('AllByOccurredAt');
      expect(cmd.input.ExpressionAttributeValues?.[':pk']).toBe(ERROR_EVENT_GSI1_PK);
      expect(cmd.input.ScanIndexForward).toBe(false);
      expect(result.items).toEqual([sampleEvent]);
      expect(result.nextCursor).toBeNull();
    });

    it('serviceId 指定なら main table の PK にクエリする', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] } as never);

      await reader.list({ serviceId: 'stock-tracker' });

      const cmd = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(cmd.input.IndexName).toBeUndefined();
      expect(cmd.input.ExpressionAttributeValues?.[':pk']).toBe('ERROR_EVENT#stock-tracker');
    });

    it('from / to 両方ある場合は SK BETWEEN になる', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] } as never);

      await reader.list({
        serviceId: 'stock-tracker',
        from: '2026-05-01T00:00:00Z',
        to: '2026-05-31T23:59:59Z',
      });

      const cmd = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(cmd.input.KeyConditionExpression).toContain('BETWEEN');
    });

    it('from のみなら >= で絞る', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] } as never);
      await reader.list({ from: '2026-05-01T00:00:00Z' });
      const cmd = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(cmd.input.KeyConditionExpression).toContain('>=');
    });

    it('to のみなら <= で絞る', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] } as never);
      await reader.list({ to: '2026-05-31T00:00:00Z' });
      const cmd = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(cmd.input.KeyConditionExpression).toContain('<=');
    });

    it('from / to は SK に埋め込まれる固定長の ISO 文字列に揃えて比較する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] } as never);

      await reader.list({ from: '2026-05-01T00:00:00Z', to: '2026-05-31T23:59:59Z' });

      const cmd = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(cmd.input.ExpressionAttributeValues?.[':from']).toBe(
        'OCCURRED#2026-05-01T00:00:00.000Z'
      );
      expect(cmd.input.ExpressionAttributeValues?.[':to']).toBe(
        'OCCURRED#2026-05-31T23:59:59.000Z\uffff'
      );
    });

    it('解釈できない from はそのまま比較に使う', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] } as never);

      await reader.list({ from: 'x' });

      const cmd = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(cmd.input.ExpressionAttributeValues?.[':from']).toBe('OCCURRED#x');
    });

    it('旧形式の Item も読める', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'ERROR_EVENT#stock-tracker',
            SK: 'OCCURRED#2026-05-06T00:00:00.000Z#evt-1',
            eventId: 'evt-1',
            serviceId: 'stock-tracker',
            source: 'cloudwatch-alarm',
            severity: 'error',
            title: 'sample',
            message: 'sample',
            context: '{}',
            occurredAt: '2026-05-06T00:00:00.000Z',
            ttl: 1,
          },
        ],
      } as never);

      const result = await reader.list({});
      expect(result.items).toEqual([sampleEvent]);
    });

    it('from > to のとき例外', async () => {
      await expect(
        reader.list({ from: '2026-05-31T00:00:00Z', to: '2026-05-01T00:00:00Z' })
      ).rejects.toThrow('from は to よりも前の時刻');
      expect(mockDocClient.send).not.toHaveBeenCalled();
    });

    it('LastEvaluatedKey がある場合 nextCursor を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [itemFor(sampleEvent)],
        LastEvaluatedKey: { PK: 'ERROR_EVENT#stock-tracker', SK: 'OCCURRED#x#y' },
      } as never);

      const result = await reader.list({});
      expect(result.nextCursor).not.toBeNull();
    });

    it('cursor が指定されていれば ExclusiveStartKey に渡す', async () => {
      const lastKey = { PK: 'ERROR_EVENT#stock-tracker', SK: 'OCCURRED#x#y' };
      const cursor = encodeCursor(lastKey);
      mockDocClient.send.mockResolvedValueOnce({ Items: [] } as never);

      await reader.list({ cursor });

      const cmd = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(cmd.input.ExclusiveStartKey).toEqual(lastKey);
    });

    it('不正な Item が含まれる場合は除外せず例外を伝える', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [itemFor(sampleEvent), { ...itemFor(sampleEvent), Severity: 'unknown' }],
      } as never);

      await expect(reader.list({})).rejects.toThrow('Severity');
    });
  });

  describe('findById', () => {
    it('PK + SK で 1 件取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: itemFor(sampleEvent) } as never);

      const result = await reader.findById(
        sampleEvent.eventId,
        sampleEvent.occurredAt,
        sampleEvent.serviceId
      );

      const cmd = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(cmd).toBeInstanceOf(GetCommand);
      expect(cmd.input.Key).toEqual({
        PK: 'ERROR_EVENT#stock-tracker',
        SK: 'OCCURRED#2026-05-06T00:00:00.000Z#evt-1',
      });
      expect(result).toEqual(sampleEvent);
    });

    it('該当無しなら null', async () => {
      mockDocClient.send.mockResolvedValueOnce({} as never);
      const result = await reader.findById('x', sampleEvent.occurredAt, 'stock-tracker');
      expect(result).toBeNull();
    });

    it('不正な Item なら例外を伝える', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: { ...itemFor(sampleEvent), Source: 'unknown' },
      } as never);

      await expect(
        reader.findById(sampleEvent.eventId, sampleEvent.occurredAt, sampleEvent.serviceId)
      ).rejects.toThrow('Source');
    });
  });
});
