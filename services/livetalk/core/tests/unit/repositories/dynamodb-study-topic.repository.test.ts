import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBStudyTopicRepository } from '../../../src/repositories/dynamodb-study-topic.repository.js';
import type { StudyTopicEntity } from '../../../src/entities/study-topic.entity.js';

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
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'tp1',
        Topic: 'モンスターハンター',
        Priority: 10,
        Status: 'pending',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(entity.UserID).toBe('u1');
      expect(entity.TopicID).toBe('tp1');
      expect(entity.Status).toBe('pending');
      expect(entity.CreatedAt).toBe(FIXED_NOW);
    });

    it('TTL 付きで保存できる', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      const repo = makeRepo(mockSend);
      const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      const entity = await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'tp1',
        Topic: 'テスト',
        Priority: 5,
        Status: 'pending',
        Ttl: ttl,
      });

      expect(entity.Ttl).toBe(ttl);
    });

    it('DynamoDB エラー → DatabaseError', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('DB down'));
      const repo = makeRepo(mockSend);

      await expect(
        repo.put({
          UserID: 'u1',
          CharacterID: 'hiyori',
          TopicID: 'tp1',
          Topic: 'テスト',
          Priority: 1,
          Status: 'pending',
        })
      ).rejects.toMatchObject({ name: 'DatabaseError' });
    });
  });

  describe('listByStatus()', () => {
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
      expect(items[0].Status).toBe('pending');
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
      expect(items[0].Priority).toBe(10);
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
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'tp1',
        Status: 'done',
        Priority: 10,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.Status).toBe('done');
    });

    it('TTL 付きで更新できる', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 86400;
      const updatedRaw = makeItemRaw({ Status: 'done', Ttl: ttl });
      const mockSend = jest.fn().mockResolvedValue({ Attributes: updatedRaw });
      const repo = makeRepo(mockSend);

      const result = await repo.updateStatus({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'tp1',
        Status: 'done',
        Priority: 10,
        Ttl: ttl,
      });

      expect(result.Ttl).toBe(ttl);
    });

    it('DynamoDB エラー → DatabaseError', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('update failed'));
      const repo = makeRepo(mockSend);

      await expect(
        repo.updateStatus({
          UserID: 'u1',
          CharacterID: 'hiyori',
          TopicID: 'tp1',
          Status: 'done',
          Priority: 1,
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
      expect(found!.TopicID).toBe('tp1');
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
