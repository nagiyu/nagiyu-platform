import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBSafetyEventRepository } from '../../../src/repositories/dynamodb-safety-event.repository.js';

const TABLE = 'nagiyu-livetalk-test';
const FIXED_NOW = 1_700_000_000_000;
const FIXED_ULID = 'TEST_ULID';

function makeDocClient(mockSend: jest.Mock) {
  return {
    send: mockSend,
  } as unknown as DynamoDBDocumentClient;
}

function makeRepo(mockSend: jest.Mock) {
  return new DynamoDBSafetyEventRepository(
    makeDocClient(mockSend),
    TABLE,
    () => FIXED_ULID,
    () => FIXED_NOW
  );
}

describe('DynamoDBSafetyEventRepository', () => {
  describe('create()', () => {
    it('PutCommand で DynamoDB に書き込み、エンティティを返す', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      const repo = makeRepo(mockSend);

      const entity = await repo.create({
        UserID: 'u1',
        Trigger: 'input_keyword',
        DetectedPattern: '[自殺念慮] 死にたい',
        InputText: '死にたい',
        ResponseText: 'ねえ、今すごく心配しちゃった…',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(entity.UserID).toBe('u1');
      expect(entity.EventID).toBe(FIXED_ULID);
      expect(entity.Trigger).toBe('input_keyword');
      expect(entity.CreatedAt).toBe(FIXED_NOW);
    });

    it('明示的な EventID を使用する', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      const repo = makeRepo(mockSend);

      const entity = await repo.create({
        UserID: 'u1',
        Trigger: 'output_moderation',
        DetectedPattern: 'Moderation flagged',
        InputText: 'test',
        ResponseText: 'response',
        EventID: 'explicit-id',
      });

      expect(entity.EventID).toBe('explicit-id');
    });

    it('ConditionalCheckFailedException → EntityAlreadyExistsError', async () => {
      const error = Object.assign(new Error('条件不一致'), {
        name: 'ConditionalCheckFailedException',
      });
      const mockSend = jest.fn().mockRejectedValue(error);
      const repo = makeRepo(mockSend);

      await expect(
        repo.create({
          UserID: 'u1',
          Trigger: 'input_keyword',
          DetectedPattern: 'test',
          InputText: 'test',
          ResponseText: 'response',
          EventID: 'dup-id',
        })
      ).rejects.toMatchObject({ name: 'EntityAlreadyExistsError' });
    });

    it('DynamoDB 一般エラー → DatabaseError', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('DB down'));
      const repo = makeRepo(mockSend);

      await expect(
        repo.create({
          UserID: 'u1',
          Trigger: 'input_keyword',
          DetectedPattern: 'test',
          InputText: 'test',
          ResponseText: 'response',
        })
      ).rejects.toMatchObject({ name: 'DatabaseError' });
    });
  });

  describe('getById()', () => {
    it('アイテムが存在する場合エンティティを返す', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Item: {
          PK: 'USER#u1',
          SK: 'SAFETY#TEST_ULID',
          Type: 'SafetyEvent',
          UserID: 'u1',
          EventID: 'TEST_ULID',
          Trigger: 'input_keyword',
          DetectedPattern: '[自殺念慮] 死にたい',
          InputText: '死にたい',
          ResponseText: '心配してる',
          CreatedAt: FIXED_NOW,
          UpdatedAt: FIXED_NOW,
        },
      });
      const repo = makeRepo(mockSend);

      const result = await repo.getById({ userId: 'u1', eventId: 'TEST_ULID' });
      expect(result).not.toBeNull();
      expect(result?.EventID).toBe('TEST_ULID');
      expect(result?.Trigger).toBe('input_keyword');
    });

    it('アイテムが存在しない場合 null を返す', async () => {
      const mockSend = jest.fn().mockResolvedValue({ Item: undefined });
      const repo = makeRepo(mockSend);

      const result = await repo.getById({ userId: 'u1', eventId: 'nonexistent' });
      expect(result).toBeNull();
    });

    it('DynamoDB エラー → DatabaseError', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('DB timeout'));
      const repo = makeRepo(mockSend);

      await expect(repo.getById({ userId: 'u1', eventId: 'x' })).rejects.toMatchObject({
        name: 'DatabaseError',
      });
    });
  });
});
