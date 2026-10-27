import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { EntityNotFoundError } from '@nagiyu/aws';
import { DynamoDBStudyTopicRepository } from '../../../src/repositories/dynamodb-study-topic.repository.js';

const TABLE = 'nagiyu-livetalk-test';
const FIXED_NOW = 1_700_000_000_000;

function makeDocClient(mockSend: jest.Mock) {
  return { send: mockSend } as unknown as DynamoDBDocumentClient;
}

function makeRepo(mockSend: jest.Mock) {
  return new DynamoDBStudyTopicRepository(makeDocClient(mockSend), TABLE, () => FIXED_NOW);
}

function makeItemRaw(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    PK: 'USER#u1',
    SK: 'CHAR#hiyori#STUDY#tp1',
    Type: 'StudyTopic',
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'tp1',
    Topic: 'モンスターハンター',
    Priority: 10,
    Status: 'pending',
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
    ...overrides,
  };
}

describe('DynamoDBStudyTopicRepository', () => {
  describe('put()', () => {
    it('PutCommand で DynamoDB に書き込み、エンティティを返す', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      const repo = makeRepo(mockSend);

      const entity = await repo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'tp1',
        topic: 'モンスターハンター',
        priority: 10,
        status: 'pending',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(entity.userId).toBe('u1');
      expect(entity.topicId).toBe('tp1');
      expect(entity.status).toBe('pending');
      expect(entity.createdAt).toBe(FIXED_NOW);
    });

    it('expiresAt を TTL 属性のエポック秒で保存できる', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      const repo = makeRepo(mockSend);
      const expiresAt = FIXED_NOW + 30 * 24 * 60 * 60 * 1000;

      const entity = await repo.put({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'tp1',
        topic: 'テスト',
        priority: 5,
        status: 'pending',
        expiresAt,
      });

      expect(entity.expiresAt).toBe(expiresAt);
      const item = (mockSend.mock.calls[0][0] as PutCommand).input.Item;
      expect(item?.TTL).toBe(Math.floor(expiresAt / 1000));
      expect(item).not.toHaveProperty('Ttl');
    });

    it('DynamoDB エラー → DatabaseError', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('DB down'));
      const repo = makeRepo(mockSend);

      await expect(
        repo.put({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: 'tp1',
          topic: 'テスト',
          priority: 1,
          status: 'pending',
        })
      ).rejects.toMatchObject({ name: 'DatabaseError' });
    });
  });

  describe('listByStatus()', () => {
    it('旧属性名 Ttl だけで保存された Item も読める', async () => {
      const mockSend = jest
        .fn()
        .mockResolvedValue({ Items: [makeItemRaw({ Ttl: 1_700_086_400 })] });
      const repo = makeRepo(mockSend);

      const items = await repo.listByStatus('u1', 'hiyori');
      expect(items[0].expiresAt).toBe(1_700_086_400_000);
    });

    it('全件取得（status 未指定）', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Items: [
          makeItemRaw(),
          makeItemRaw({ SK: 'CHAR#hiyori#STUDY#tp2', TopicID: 'tp2', Status: 'done' }),
        ],
      });
      const repo = makeRepo(mockSend);

      const items = await repo.listByStatus('u1', 'hiyori');
      expect(items).toHaveLength(2);
    });

    it('pending のみ取得', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Items: [
          makeItemRaw({ Status: 'pending' }),
          makeItemRaw({ SK: 'CHAR#hiyori#STUDY#tp2', TopicID: 'tp2', Status: 'done' }),
        ],
      });
      const repo = makeRepo(mockSend);

      const items = await repo.listByStatus('u1', 'hiyori', 'pending');
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe('pending');
    });

    it('Priority 降順でソートされる', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Items: [
          makeItemRaw({ TopicID: 'tp1', Priority: 1 }),
          makeItemRaw({ SK: 'CHAR#hiyori#STUDY#tp2', TopicID: 'tp2', Priority: 10 }),
        ],
      });
      const repo = makeRepo(mockSend);

      const items = await repo.listByStatus('u1', 'hiyori');
      expect(items[0].priority).toBe(10);
    });

    it('ページネーション（LastEvaluatedKey）を処理する', async () => {
      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({
          Items: [makeItemRaw()],
          LastEvaluatedKey: { PK: 'USER#u1', SK: 'CHAR#hiyori#STUDY#tp1' },
        })
        .mockResolvedValueOnce({
          Items: [makeItemRaw({ SK: 'CHAR#hiyori#STUDY#tp2', TopicID: 'tp2' })],
        });
      const repo = makeRepo(mockSend);

      const items = await repo.listByStatus('u1', 'hiyori');
      expect(items).toHaveLength(2);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('DynamoDB エラー → DatabaseError', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('query failed'));
      const repo = makeRepo(mockSend);

      await expect(repo.listByStatus('u1', 'hiyori')).rejects.toMatchObject({
        name: 'DatabaseError',
      });
    });

    it('Items が undefined の場合は空配列', async () => {
      const mockSend = jest.fn().mockResolvedValue({ Items: undefined });
      const repo = makeRepo(mockSend);

      const items = await repo.listByStatus('u1', 'hiyori');
      expect(items).toHaveLength(0);
    });
  });

  describe('updateStatus()', () => {
    it('UpdateCommand で Status を更新し、エンティティを返す', async () => {
      const updatedRaw = makeItemRaw({ Status: 'done', UpdatedAt: FIXED_NOW + 1000 });
      const mockSend = jest.fn().mockResolvedValue({ Attributes: updatedRaw });
      const repo = makeRepo(mockSend);

      const result = await repo.updateStatus({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'tp1',
        status: 'done',
        priority: 10,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('done');
    });

    it('expiresAt を渡すと TTL 属性のエポック秒で更新し、旧属性名 Ttl を削除する', async () => {
      const expiresAt = FIXED_NOW + 86_400_000;
      const updatedRaw = makeItemRaw({ Status: 'done', TTL: Math.floor(expiresAt / 1000) });
      const mockSend = jest.fn().mockResolvedValue({ Attributes: updatedRaw });
      const repo = makeRepo(mockSend);

      const result = await repo.updateStatus({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'tp1',
        status: 'done',
        priority: 10,
        expiresAt,
      });

      expect(result.expiresAt).toBe(Math.floor(expiresAt / 1000) * 1000);
      const input = (mockSend.mock.calls[0][0] as UpdateCommand).input;
      expect(input.UpdateExpression).toMatch(/SET .*REMOVE /);
      expect(Object.values(input.ExpressionAttributeNames ?? {})).toEqual(
        expect.arrayContaining(['TTL', 'Ttl'])
      );
      expect(Object.values(input.ExpressionAttributeValues ?? {})).toContain(
        Math.floor(expiresAt / 1000)
      );
    });

    it('expiresAt を渡さなければ TTL 属性に触れない', async () => {
      const mockSend = jest.fn().mockResolvedValue({ Attributes: makeItemRaw({ Status: 'done' }) });
      const repo = makeRepo(mockSend);

      await repo.updateStatus({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'tp1',
        status: 'done',
        priority: 10,
      });

      const input = (mockSend.mock.calls[0][0] as UpdateCommand).input;
      expect(Object.values(input.ExpressionAttributeNames ?? {})).not.toContain('TTL');
    });

    it('対象が存在しない場合は EntityNotFoundError を投げる', async () => {
      const mockSend = jest.fn().mockRejectedValue(
        Object.assign(new Error('conditional check failed'), {
          name: 'ConditionalCheckFailedException',
        })
      );
      const repo = makeRepo(mockSend);

      await expect(
        repo.updateStatus({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: 'missing',
          status: 'done',
          priority: 1,
        })
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('DynamoDB エラー → DatabaseError', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('update failed'));
      const repo = makeRepo(mockSend);

      await expect(
        repo.updateStatus({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: 'tp1',
          status: 'done',
          priority: 1,
        })
      ).rejects.toMatchObject({ name: 'DatabaseError' });
    });
  });

  describe('findPendingByTopic()', () => {
    it('pending のトピックが見つかる', async () => {
      const mockSend = jest.fn().mockResolvedValue({ Items: [makeItemRaw({ Status: 'pending' })] });
      const repo = makeRepo(mockSend);

      const found = await repo.findPendingByTopic('u1', 'hiyori', 'モンスターハンター');
      expect(found).not.toBeNull();
      expect(found!.topicId).toBe('tp1');
    });

    it('in_progress のトピックも見つかる（重複防止対象）', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Items: [makeItemRaw({ Status: 'in_progress' })],
      });
      const repo = makeRepo(mockSend);

      const found = await repo.findPendingByTopic('u1', 'hiyori', 'モンスターハンター');
      expect(found).not.toBeNull();
    });

    it('done のトピックは見つからない', async () => {
      const mockSend = jest.fn().mockResolvedValue({ Items: [makeItemRaw({ Status: 'done' })] });
      const repo = makeRepo(mockSend);

      const found = await repo.findPendingByTopic('u1', 'hiyori', 'モンスターハンター');
      expect(found).toBeNull();
    });

    it('大文字小文字を無視してマッチ', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Items: [makeItemRaw({ Topic: 'JavaScript', Status: 'pending' })],
      });
      const repo = makeRepo(mockSend);

      const found = await repo.findPendingByTopic('u1', 'hiyori', 'javascript');
      expect(found).not.toBeNull();
    });

    it('一致しない場合は null', async () => {
      const mockSend = jest.fn().mockResolvedValue({ Items: [makeItemRaw({ Status: 'pending' })] });
      const repo = makeRepo(mockSend);

      const found = await repo.findPendingByTopic('u1', 'hiyori', '存在しないトピック');
      expect(found).toBeNull();
    });
  });
});
