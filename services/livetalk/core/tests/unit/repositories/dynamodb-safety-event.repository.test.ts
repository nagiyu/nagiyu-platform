import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBSafetyEventRepository } from '../../../src/repositories/dynamodb-safety-event.repository.js';
import type { SafetyEventSummary } from '../../../src/entities/safety-event.entity.js';

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

/** デフォルト引数（ulidFactory / nowMs）で生成するリポジトリ */
function makeRepoDefault(mockSend: jest.Mock) {
  return new DynamoDBSafetyEventRepository(makeDocClient(mockSend), TABLE);
}

describe('DynamoDBSafetyEventRepository', () => {
  describe('デフォルト引数の動作', () => {
    it('ulidFactory / nowMs をデフォルト値で生成できる', async () => {
      // デフォルト引数（行 28）のブランチをカバーする
      const mockSend = jest.fn().mockResolvedValue({});
      const repo = makeRepoDefault(mockSend);
      // create 呼び出しで EventID が ULID として自動生成される
      const entity = await repo.create({
        UserID: 'u-default',
        CharacterID: 'hiyori',
        Trigger: 'input_keyword',
        DetectedPattern: 'test',
        InputText: 'input',
        ResponseText: 'response',
      });
      expect(entity.EventID).toBeTruthy();
      expect(entity.CreatedAt).toBeGreaterThan(0);
    });
  });

  describe('create()', () => {
    it('PutCommand で DynamoDB に書き込み、エンティティを返す', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      const repo = makeRepo(mockSend);

      const entity = await repo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Trigger: 'input_keyword',
        DetectedPattern: '[自殺念慮] 死にたい',
        InputText: '死にたい',
        ResponseText: 'ねえ、今すごく心配しちゃった…',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(entity.UserID).toBe('u1');
      expect(entity.CharacterID).toBe('hiyori');
      expect(entity.EventID).toBe(FIXED_ULID);
      expect(entity.Trigger).toBe('input_keyword');
      expect(entity.CreatedAt).toBe(FIXED_NOW);

      // sparse GSI2 属性が書き込まれていること（これが欠けると横断 Query が空になる）
      const putItem = mockSend.mock.calls[0][0].input.Item;
      expect(putItem.GSI2PK).toBe('SAFETY');
      expect(putItem.GSI2SK).toBe(FIXED_ULID);
      expect(putItem.CharacterID).toBe('hiyori');
      // PII を含む属性はベーステーブルには保持されるが、後述の listRecent では射影されない
      expect(putItem.InputText).toBe('死にたい');
    });

    it('明示的な EventID を使用する', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      const repo = makeRepo(mockSend);

      const entity = await repo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
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
          CharacterID: 'hiyori',
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
          CharacterID: 'hiyori',
          Trigger: 'input_keyword',
          DetectedPattern: 'test',
          InputText: 'test',
          ResponseText: 'response',
        })
      ).rejects.toMatchObject({ name: 'DatabaseError' });
    });

    it('Error 以外の例外も DatabaseError に変換する', async () => {
      // error instanceof Error が false のブランチ（行 64-65）
      const mockSend = jest.fn().mockRejectedValue('文字列エラー');
      const repo = makeRepo(mockSend);

      await expect(
        repo.create({
          UserID: 'u1',
          CharacterID: 'hiyori',
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
          CharacterID: 'hiyori',
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
      expect(result?.CharacterID).toBe('hiyori');
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

    it('Error 以外の例外も DatabaseError に変換する', async () => {
      // error instanceof Error が false のブランチ（行 81-82）
      const mockSend = jest.fn().mockRejectedValue(42);
      const repo = makeRepo(mockSend);

      await expect(repo.getById({ userId: 'u1', eventId: 'x' })).rejects.toMatchObject({
        name: 'DatabaseError',
      });
    });
  });

  describe('listRecent()', () => {
    it('GSI2 クエリを ScanIndexForward=false で発行する', async () => {
      const items: SafetyEventSummary[] = [
        {
          UserID: 'u1',
          EventID: 'ULID2',
          CharacterID: 'hiyori',
          Trigger: 'input_keyword',
          DetectedPattern: 'test',
          CreatedAt: FIXED_NOW + 1000,
        },
        {
          UserID: 'u2',
          EventID: 'ULID1',
          Trigger: 'output_moderation',
          DetectedPattern: 'Moderation',
          CreatedAt: FIXED_NOW,
        },
      ];

      const mockSend = jest.fn().mockResolvedValue({
        Items: items.map((s) => ({
          GSI2PK: 'SAFETY',
          GSI2SK: s.EventID,
          UserID: s.UserID,
          EventID: s.EventID,
          ...(s.CharacterID !== undefined ? { CharacterID: s.CharacterID } : {}),
          Trigger: s.Trigger,
          DetectedPattern: s.DetectedPattern,
          CreatedAt: s.CreatedAt,
        })),
      });
      const repo = makeRepo(mockSend);

      const result = await repo.listRecent(10);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // QueryCommand の引数を検証
      const call = mockSend.mock.calls[0][0];
      expect(call.input.IndexName).toBe('GSI2');
      expect(call.input.ScanIndexForward).toBe(false);
      expect(call.input.Limit).toBe(10);

      expect(result).toHaveLength(2);
      expect(result[0].EventID).toBe('ULID2');
      expect(result[0].CharacterID).toBe('hiyori');
      expect(result[1].EventID).toBe('ULID1');
      // PII が含まれないことを確認
      expect((result[0] as unknown as Record<string, unknown>).InputText).toBeUndefined();
      expect((result[0] as unknown as Record<string, unknown>).ResponseText).toBeUndefined();
    });

    it('アイテムが 0 件の場合は空配列を返す', async () => {
      const mockSend = jest.fn().mockResolvedValue({ Items: [] });
      const repo = makeRepo(mockSend);

      const result = await repo.listRecent(10);
      expect(result).toEqual([]);
    });

    it('Items が undefined の場合も空配列を返す', async () => {
      // result.Items ?? [] のフォールバックをテスト
      const mockSend = jest.fn().mockResolvedValue({});
      const repo = makeRepo(mockSend);

      const result = await repo.listRecent(10);
      expect(result).toEqual([]);
    });

    it('DynamoDB エラー → DatabaseError', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('GSI エラー'));
      const repo = makeRepo(mockSend);

      await expect(repo.listRecent(10)).rejects.toMatchObject({ name: 'DatabaseError' });
    });

    it('Error 以外の例外も DatabaseError に変換する', async () => {
      // error instanceof Error が false のブランチ
      const mockSend = jest.fn().mockRejectedValue('文字列エラー');
      const repo = makeRepo(mockSend);

      await expect(repo.listRecent(10)).rejects.toMatchObject({ name: 'DatabaseError' });
    });
  });
});
