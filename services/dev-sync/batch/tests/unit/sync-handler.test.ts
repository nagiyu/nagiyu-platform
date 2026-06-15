/**
 * sync-handler Lambda ハンドラーの単体テスト
 *
 * DynamoDB への実際のアクセスはモックする（副作用のある処理のみモック）。
 */

import { jest } from '@jest/globals';

// DynamoDocumentClientStoreAdapter と getDynamoDBDocumentClient をモック
// （Lambda 内で実際の DynamoDB に接続しないようにする）
const mockPut = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDelete = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockScan = jest.fn();
const mockQueryGsi = jest.fn();

jest.mock('../../src/lib/dynamo-store-adapter.js', () => ({
  DynamoDocumentClientStoreAdapter: jest.fn().mockImplementation(() => ({
    put: mockPut,
    delete: mockDelete,
    scan: mockScan,
    queryGsi: mockQueryGsi,
  })),
}));

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn().mockReturnValue({}),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let handler: (event: unknown) => Promise<{ statusCode: number; body: string }>;

beforeAll(async () => {
  const mod = await import('../../src/sync-handler.js');
  handler = mod.handler;
});

describe('sync-handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルト: scan で空ページを返す
    mockScan.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });
    mockQueryGsi.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });
  });

  describe('zod バリデーション', () => {
    it('不正な入力（null）は 400 を返す', async () => {
      const response = await handler(null);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('バリデーション');
    });

    it('不正な入力（空オブジェクト）は 400 を返す', async () => {
      const response = await handler({});
      expect(response.statusCode).toBe(400);
    });

    it('strategy が不正な値は 400 を返す', async () => {
      const response = await handler({
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'invalid',
        delete: 'on',
      });
      expect(response.statusCode).toBe(400);
    });

    it('destTable が空文字列は 400 を返す', async () => {
      const response = await handler({
        sourceTable: 'nagiyu-test-prod',
        destTable: '',
        strategy: 'mirror',
        delete: 'on',
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('mirror 戦略の正常系', () => {
    it('有効な mirror 設定は 200 を返す', async () => {
      // mirror 戦略は scope が必須
      const response = await handler({
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'mirror',
        scope: { pkPrefix: 'USER#' },
        delete: 'off',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { message: string; result: { upserted: number } };
      expect(body.message).toContain('完了');
      expect(body.result.upserted).toBe(0);
    });
  });

  describe('安全ガード', () => {
    it('destTable が -dev で終わらない場合は 500 を返す', async () => {
      // zod は通過する（destTable の形式はスキーマで検証しない）が、
      // copy-logic 内の assertDestIsDevTable で abort される
      const response = await handler({
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-prod', // 危険: prod テーブル
        strategy: 'mirror',
        scope: { pkPrefix: 'USER#' }, // mirror 戦略では scope 必須
        delete: 'off',
      });

      // copy-logic 内の安全ガードで abort → 500 を返す
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('-dev');
    });
  });

  describe('gsiWindow 戦略', () => {
    it('有効な gsiWindow 設定は 200 を返す', async () => {
      const response = await handler({
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'gsiWindow',
        delete: 'off',
        gsi: {
          indexName: 'GSI1',
          pkAttributeName: 'GSI1PK',
          pkValue: 'ALERT',
          skAttributeName: 'GSI1SK',
          windowDays: 7,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
