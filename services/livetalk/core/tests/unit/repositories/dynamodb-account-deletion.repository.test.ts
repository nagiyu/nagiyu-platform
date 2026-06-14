/**
 * DynamoDBAccountDeletionRepository のユニットテスト（退会・データ削除 / Issue #3579）。
 *
 * DynamoDB クライアントをモックし、アカウント削除の全ロジックを検証する。
 *
 * テスト観点:
 * (a) Query のページネーション（ExclusiveStartKey ループで全件取得する）
 * (b) 非 SafetyEvent の BatchWrite 削除（25件/バッチ）
 * (c) SafetyEvent の TransactWrite による re-key＋匿名化
 *     - UserID が anonToken に置換される
 *     - PK が `USER#ANON#…` に変わる
 *     - GSI2PK / GSI2SK が維持される
 *     - InputText / ResponseText / EventID が保持される
 *     - AnonymizedAt が付与される
 * (d) UnprocessedItems リトライ（指数バックオフ）
 * (e) 何も無い PK での冪等（書き込み 0）
 * (f) DatabaseError ラップ（クエリ失敗・バッチ削除失敗・re-key 失敗）
 * (g) 結果カウント（deletedCount / anonymizedCount）
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBAccountDeletionRepository,
  ACCOUNT_DELETION_ERROR_MESSAGES,
} from '../../../src/repositories/dynamodb-account-deletion.repository.js';

const TABLE = 'nagiyu-livetalk-test';
const FIXED_NOW = 1_700_000_000_000;
const FIXED_ULID = 'TESTULIDVALUE01234567890';
const ANON_TOKEN = `ANON#${FIXED_ULID}`;
const USER_ID = 'google-user-001';

/** noopのsleep（テストでは待機しない） */
const noopSleep = () => Promise.resolve();

function makeDocClient(mockSend: jest.Mock) {
  return { send: mockSend } as unknown as DynamoDBDocumentClient;
}

function makeRepo(
  mockSend: jest.Mock,
  opts?: { ulidFactory?: () => string; nowMs?: () => number }
) {
  return new DynamoDBAccountDeletionRepository(
    makeDocClient(mockSend),
    TABLE,
    opts?.ulidFactory ?? (() => FIXED_ULID),
    opts?.nowMs ?? (() => FIXED_NOW),
    noopSleep
  );
}

/** 典型的な非 SafetyEvent アイテム */
function makeProfileItem(userId: string) {
  return {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    Type: 'Profile',
    UserID: userId,
    DisplayName: 'テストユーザー',
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
  };
}

/** 典型的な SafetyEvent アイテム */
function makeSafetyItem(userId: string, eventId: string) {
  return {
    PK: `USER#${userId}`,
    SK: `SAFETY#${eventId}`,
    Type: 'SafetyEvent',
    UserID: userId,
    EventID: eventId,
    CharacterID: 'hiyori',
    Trigger: 'input_keyword',
    DetectedPattern: '[自殺念慮] 死にたい',
    InputText: '死にたい',
    ResponseText: '心配してるよ',
    GSI2PK: 'SAFETY',
    GSI2SK: eventId,
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
  };
}

describe('DynamoDBAccountDeletionRepository', () => {
  describe('デフォルト引数の動作', () => {
    it('ulidFactory / nowMs / sleep をデフォルト値で生成できる', () => {
      const mockSend = jest.fn();
      const repo = new DynamoDBAccountDeletionRepository(makeDocClient(mockSend), TABLE);
      expect(repo).toBeInstanceOf(DynamoDBAccountDeletionRepository);
    });
  });

  describe('(e) 空の PK の冪等動作', () => {
    it('アイテムが 0 件のとき書き込みなしで { deletedCount: 0, anonymizedCount: 0 } を返す', async () => {
      const mockSend = jest
        .fn()
        // Query: 0件
        .mockResolvedValueOnce({ Items: [] });

      const repo = makeRepo(mockSend);
      const result = await repo.deleteAccount(USER_ID);

      expect(result).toEqual({ deletedCount: 0, anonymizedCount: 0 });
      // Query 1 回のみ（BatchWrite / TransactWrite は呼ばれない）
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('Items が undefined でも 0件として扱う', async () => {
      const mockSend = jest.fn().mockResolvedValueOnce({});
      const repo = makeRepo(mockSend);
      const result = await repo.deleteAccount(USER_ID);
      expect(result).toEqual({ deletedCount: 0, anonymizedCount: 0 });
    });
  });

  describe('(a) Query のページネーション', () => {
    it('LastEvaluatedKey がある場合に複数ページを取得する', async () => {
      const profile = makeProfileItem(USER_ID);
      const safetyItem = makeSafetyItem(USER_ID, 'EVT001');

      const mockSend = jest
        .fn()
        // ページ 1: LastEvaluatedKey あり
        .mockResolvedValueOnce({
          Items: [profile],
          LastEvaluatedKey: { PK: profile.PK, SK: profile.SK },
        })
        // ページ 2: LastEvaluatedKey なし（最終ページ）
        .mockResolvedValueOnce({ Items: [safetyItem] })
        // BatchWrite（profile 削除）
        .mockResolvedValueOnce({ UnprocessedItems: {} })
        // TransactWrite（SafetyEvent re-key）
        .mockResolvedValueOnce({});

      const repo = makeRepo(mockSend);
      const result = await repo.deleteAccount(USER_ID);

      // Query が 2 回呼ばれていること
      const queryCalls = mockSend.mock.calls.filter((call) =>
        call[0]?.constructor?.name?.includes('QueryCommand')
      );
      expect(queryCalls.length).toBe(2);
      // 2 回目のクエリに ExclusiveStartKey が設定されていること
      expect(queryCalls[1][0].input.ExclusiveStartKey).toEqual({
        PK: profile.PK,
        SK: profile.SK,
      });

      expect(result.deletedCount).toBe(1);
      expect(result.anonymizedCount).toBe(1);
    });
  });

  describe('(b) 非 SafetyEvent の BatchWrite 削除', () => {
    it('非 SafetyEvent アイテムを BatchWriteCommand で削除する', async () => {
      const profile = makeProfileItem(USER_ID);

      const mockSend = jest
        .fn()
        // Query
        .mockResolvedValueOnce({ Items: [profile] })
        // BatchWrite
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      const repo = makeRepo(mockSend);
      const result = await repo.deleteAccount(USER_ID);

      expect(result.deletedCount).toBe(1);
      expect(result.anonymizedCount).toBe(0);

      // BatchWrite コマンドの内容を検証
      const batchCall = mockSend.mock.calls[1];
      const batchInput = batchCall[0].input;
      expect(batchInput.RequestItems[TABLE]).toHaveLength(1);
      expect(batchInput.RequestItems[TABLE][0].DeleteRequest.Key).toEqual({
        PK: `USER#${USER_ID}`,
        SK: 'PROFILE',
      });
    });

    it('25件を超えるアイテムを複数バッチに分割して削除する', async () => {
      // 26件の非SafetyEventアイテムを用意する
      const items = Array.from({ length: 26 }, (_, i) => ({
        PK: `USER#${USER_ID}`,
        SK: `CHAR#hiyori#MSG#MSG${String(i).padStart(3, '0')}`,
        Type: 'Message',
        UserID: USER_ID,
      }));

      const mockSend = jest
        .fn()
        // Query（1ページ）
        .mockResolvedValueOnce({ Items: items })
        // BatchWrite 1回目（25件）
        .mockResolvedValueOnce({ UnprocessedItems: {} })
        // BatchWrite 2回目（1件）
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      const repo = makeRepo(mockSend);
      const result = await repo.deleteAccount(USER_ID);

      expect(result.deletedCount).toBe(26);
      // BatchWrite が 2 回呼ばれていること
      const batchCalls = mockSend.mock.calls.slice(1);
      expect(batchCalls.length).toBe(2);
      expect(batchCalls[0][0].input.RequestItems[TABLE].length).toBe(25);
      expect(batchCalls[1][0].input.RequestItems[TABLE].length).toBe(1);
    });
  });

  describe('(c) SafetyEvent の TransactWrite による re-key＋匿名化', () => {
    it('SafetyEvent を匿名化して re-key する', async () => {
      const eventId = 'EVT001';
      const safetyItem = makeSafetyItem(USER_ID, eventId);

      const mockSend = jest
        .fn()
        // Query
        .mockResolvedValueOnce({ Items: [safetyItem] })
        // TransactWrite
        .mockResolvedValueOnce({});

      const repo = makeRepo(mockSend);
      const result = await repo.deleteAccount(USER_ID);

      expect(result.deletedCount).toBe(0);
      expect(result.anonymizedCount).toBe(1);

      // TransactWrite の内容を検証
      const transactCall = mockSend.mock.calls[1];
      const transactInput = transactCall[0].input;
      const transactItems = transactInput.TransactItems;

      expect(transactItems).toHaveLength(2);

      // Put: 新 PK（USER#ANON#<ulid>）
      const putItem = transactItems[0].Put.Item;
      expect(putItem.PK).toBe(`USER#${ANON_TOKEN}`);
      expect(putItem.SK).toBe(`SAFETY#${eventId}`);
      expect(putItem.UserID).toBe(ANON_TOKEN);
      // GSI2PK / GSI2SK が維持される
      expect(putItem.GSI2PK).toBe('SAFETY');
      expect(putItem.GSI2SK).toBe(eventId);
      // InputText / ResponseText が保持される（証跡）
      expect(putItem.InputText).toBe('死にたい');
      expect(putItem.ResponseText).toBe('心配してるよ');
      // EventID が保持される
      expect(putItem.EventID).toBe(eventId);
      // Type が維持される
      expect(putItem.Type).toBe('SafetyEvent');
      // AnonymizedAt が付与される
      expect(putItem.AnonymizedAt).toBe(new Date(FIXED_NOW).toISOString());
      // UpdatedAt が更新される
      expect(putItem.UpdatedAt).toBe(FIXED_NOW);
      // 元の googleId が含まれないこと
      expect(putItem.PK).not.toContain(USER_ID);
      expect(putItem.UserID).not.toBe(USER_ID);

      // Delete: 旧 PK（USER#<userId>）
      const deleteKey = transactItems[1].Delete.Key;
      expect(deleteKey.PK).toBe(`USER#${USER_ID}`);
      expect(deleteKey.SK).toBe(`SAFETY#${eventId}`);
    });

    it('複数の SafetyEvent に同じ匿名トークンを付与する', async () => {
      const safetyItems = [
        makeSafetyItem(USER_ID, 'EVT001'),
        makeSafetyItem(USER_ID, 'EVT002'),
        makeSafetyItem(USER_ID, 'EVT003'),
      ];

      const mockSend = jest
        .fn()
        // Query
        .mockResolvedValueOnce({ Items: safetyItems })
        // TransactWrite × 3
        .mockResolvedValue({});

      const repo = makeRepo(mockSend);
      const result = await repo.deleteAccount(USER_ID);

      expect(result.anonymizedCount).toBe(3);

      // 全 TransactWrite で同じ匿名トークンを使用していること
      const transactCalls = mockSend.mock.calls.slice(1);
      expect(transactCalls.length).toBe(3);
      const anonTokens = transactCalls.map(
        (call) => call[0].input.TransactItems[0].Put.Item.UserID
      );
      // 全て同じトークン
      expect(new Set(anonTokens).size).toBe(1);
      expect(anonTokens[0]).toBe(ANON_TOKEN);
    });

    it('SafetyEvent の CharacterID が保持される', async () => {
      const safetyItem = makeSafetyItem(USER_ID, 'EVT001');

      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({ Items: [safetyItem] })
        .mockResolvedValueOnce({});

      const repo = makeRepo(mockSend);
      await repo.deleteAccount(USER_ID);

      const putItem = mockSend.mock.calls[1][0].input.TransactItems[0].Put.Item;
      expect(putItem.CharacterID).toBe('hiyori');
    });

    it('GSI2SK 欠落の legacy SafetyEvent でも EventID で GSI2SK を補完する', async () => {
      const eventId = 'EVT_LEGACY';
      // #3580 以前に作られ GSI2PK / GSI2SK を持たない legacy item
      const legacyItem = makeSafetyItem(USER_ID, eventId);
      delete (legacyItem as Record<string, unknown>).GSI2PK;
      delete (legacyItem as Record<string, unknown>).GSI2SK;

      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({ Items: [legacyItem] })
        .mockResolvedValueOnce({});

      const repo = makeRepo(mockSend);
      await repo.deleteAccount(USER_ID);

      const putItem = mockSend.mock.calls[1][0].input.TransactItems[0].Put.Item;
      // GSI2PK は付与、GSI2SK は EventID で補完され横断索引に確実に残る
      expect(putItem.GSI2PK).toBe('SAFETY');
      expect(putItem.GSI2SK).toBe(eventId);
    });
  });

  describe('(d) UnprocessedItems リトライ', () => {
    it('UnprocessedItems が返った場合にリトライして削除する', async () => {
      const profile = makeProfileItem(USER_ID);

      const deleteRequest = {
        DeleteRequest: { Key: { PK: profile.PK, SK: profile.SK } },
      };

      const mockSend = jest
        .fn()
        // Query
        .mockResolvedValueOnce({ Items: [profile] })
        // BatchWrite 1回目: UnprocessedItems あり
        .mockResolvedValueOnce({
          UnprocessedItems: { [TABLE]: [deleteRequest] },
        })
        // BatchWrite 2回目（リトライ）: 成功
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      const repo = makeRepo(mockSend);
      const result = await repo.deleteAccount(USER_ID);

      // Query 1 回 + BatchWrite 2 回
      expect(mockSend).toHaveBeenCalledTimes(3);
      // 最初の BatchWrite で 0 件処理（全て Unprocessed）、リトライで 1 件処理
      expect(result.deletedCount).toBe(1);
    });

    it('最大リトライ（4回）を超えても残存する場合は DatabaseError を投げる', async () => {
      const profile = makeProfileItem(USER_ID);

      const deleteRequest = {
        DeleteRequest: { Key: { PK: profile.PK, SK: profile.SK } },
      };

      const mockSend = jest
        .fn()
        // Query
        .mockResolvedValueOnce({ Items: [profile] })
        // BatchWrite 1回目〜5回目（最大リトライ超過）: 全て Unprocessed
        .mockResolvedValue({ UnprocessedItems: { [TABLE]: [deleteRequest] } });

      const repo = makeRepo(mockSend);

      // 不可逆な削除では未削除を残したまま成功扱いにせず例外を投げる
      await expect(repo.deleteAccount(USER_ID)).rejects.toMatchObject({
        name: 'DatabaseError',
        message: expect.stringContaining(ACCOUNT_DELETION_ERROR_MESSAGES.バッチ削除失敗),
      });

      // Query 1 回 + BatchWrite（1 + 4 リトライ）= 6 回
      expect(mockSend).toHaveBeenCalledTimes(6);
    });
  });

  describe('(f) DatabaseError ラップ', () => {
    it('Query 失敗 → DatabaseError（クエリ失敗メッセージ）', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('DB down'));
      const repo = makeRepo(mockSend);

      await expect(repo.deleteAccount(USER_ID)).rejects.toMatchObject({
        name: 'DatabaseError',
        message: expect.stringContaining(ACCOUNT_DELETION_ERROR_MESSAGES.クエリ失敗),
      });
    });

    it('Query 失敗: Error 以外の例外も DatabaseError に変換する', async () => {
      const mockSend = jest.fn().mockRejectedValue('文字列エラー');
      const repo = makeRepo(mockSend);

      await expect(repo.deleteAccount(USER_ID)).rejects.toMatchObject({
        name: 'DatabaseError',
      });
    });

    it('BatchWrite 失敗 → DatabaseError（バッチ削除失敗メッセージ）', async () => {
      const profile = makeProfileItem(USER_ID);

      const mockSend = jest
        .fn()
        // Query: 成功
        .mockResolvedValueOnce({ Items: [profile] })
        // BatchWrite: 失敗
        .mockRejectedValueOnce(new Error('BatchWrite failed'));

      const repo = makeRepo(mockSend);

      await expect(repo.deleteAccount(USER_ID)).rejects.toMatchObject({
        name: 'DatabaseError',
        message: expect.stringContaining(ACCOUNT_DELETION_ERROR_MESSAGES.バッチ削除失敗),
      });
    });

    it('BatchWrite 失敗: Error 以外の例外も DatabaseError に変換する', async () => {
      const profile = makeProfileItem(USER_ID);

      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({ Items: [profile] })
        .mockRejectedValueOnce(42);

      const repo = makeRepo(mockSend);

      await expect(repo.deleteAccount(USER_ID)).rejects.toMatchObject({
        name: 'DatabaseError',
      });
    });

    it('TransactWrite 失敗 → DatabaseError（再キー失敗メッセージ）', async () => {
      const safetyItem = makeSafetyItem(USER_ID, 'EVT001');

      const mockSend = jest
        .fn()
        // Query: 成功
        .mockResolvedValueOnce({ Items: [safetyItem] })
        // TransactWrite: 失敗
        .mockRejectedValueOnce(new Error('TransactWrite failed'));

      const repo = makeRepo(mockSend);

      await expect(repo.deleteAccount(USER_ID)).rejects.toMatchObject({
        name: 'DatabaseError',
        message: expect.stringContaining(ACCOUNT_DELETION_ERROR_MESSAGES.再キー失敗),
      });
    });

    it('TransactWrite 失敗: Error 以外の例外も DatabaseError に変換する', async () => {
      const safetyItem = makeSafetyItem(USER_ID, 'EVT001');

      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({ Items: [safetyItem] })
        .mockRejectedValueOnce('non-error');

      const repo = makeRepo(mockSend);

      await expect(repo.deleteAccount(USER_ID)).rejects.toMatchObject({
        name: 'DatabaseError',
      });
    });
  });

  describe('(g) 結果カウント', () => {
    it('混在アイテムの削除・匿名化カウントが正しい', async () => {
      const items = [
        makeProfileItem(USER_ID),
        { PK: `USER#${USER_ID}`, SK: 'CHAR#hiyori#MSG#001', Type: 'Message', UserID: USER_ID },
        makeSafetyItem(USER_ID, 'EVT001'),
        makeSafetyItem(USER_ID, 'EVT002'),
      ];

      const mockSend = jest
        .fn()
        // Query
        .mockResolvedValueOnce({ Items: items })
        // BatchWrite（2件の非SafetyEvent）
        .mockResolvedValueOnce({ UnprocessedItems: {} })
        // TransactWrite × 2（SafetyEvent）
        .mockResolvedValue({});

      const repo = makeRepo(mockSend);
      const result = await repo.deleteAccount(USER_ID);

      expect(result.deletedCount).toBe(2);
      expect(result.anonymizedCount).toBe(2);
    });
  });

  describe('Query の KeyConditionExpression 検証', () => {
    it('KeyConditionExpression に #pk = :pk を使用する', async () => {
      const mockSend = jest.fn().mockResolvedValueOnce({ Items: [] });
      const repo = makeRepo(mockSend);

      await repo.deleteAccount(USER_ID);

      const queryInput = mockSend.mock.calls[0][0].input;
      expect(queryInput.KeyConditionExpression).toBe('#pk = :pk');
      expect(queryInput.ExpressionAttributeNames).toEqual({ '#pk': 'PK' });
      expect(queryInput.ExpressionAttributeValues).toEqual({ ':pk': `USER#${USER_ID}` });
      expect(queryInput.TableName).toBe(TABLE);
    });
  });
});
