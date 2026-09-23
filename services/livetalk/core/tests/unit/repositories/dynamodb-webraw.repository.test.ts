import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBWebRawRepository } from '../../../src/repositories/dynamodb-webraw.repository.js';
import { WEBRAW_TTL_SECONDS } from '../../../src/constants.js';

const TABLE = 'nagiyu-livetalk-test';
const FIXED_NOW = 1_700_000_000_000;

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

function makeRepo(handler: SendHandler) {
  return new DynamoDBWebRawRepository(
    makeClient(handler) as never,
    TABLE,
    () => 'RAW-FIXED',
    () => FIXED_NOW
  );
}

describe('DynamoDBWebRawRepository', () => {
  describe('put', () => {
    it('PutCommand を送り、TTL を 90 日後に設定する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const raw = await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Query: 'コーヒー',
        RawText: 'コーヒーの効能',
        SourceUrls: ['https://example.com'],
        Origin: 'auto',
      });
      expect(raw.RawID).toBe('RAW-FIXED');
      expect(sent[0]).toBeInstanceOf(PutCommand);
      const input = (sent[0] as PutCommand).input;
      expect(input.Item?.PK).toBe('USER#u1');
      expect(input.Item?.SK).toBe('CHAR#hiyori#WEBRAW#RAW-FIXED');
      expect(input.Item?.TTL).toBe(Math.floor(FIXED_NOW / 1000) + WEBRAW_TTL_SECONDS);
    });

    it('明示的な RawID を尊重する', async () => {
      const repo = makeRepo(async () => ({}));
      const raw = await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Query: 'q',
        RawText: 't',
        SourceUrls: [],
        Origin: 'auto',
        RawID: 'custom-raw',
      });
      expect(raw.RawID).toBe('custom-raw');
    });

    it('Origin/RequestText/RequestedAt を Item に書き込む（甲-1）', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Query: '最新アニメ情報',
        RawText: '今期は〇〇が人気です',
        SourceUrls: [],
        Origin: 'request',
        RequestText: '最新アニメ情報を調べて',
        RequestedAt: FIXED_NOW - 1000,
      });
      const input = (sent[0] as PutCommand).input;
      expect(input.Item?.Origin).toBe('request');
      expect(input.Item?.RequestText).toBe('最新アニメ情報を調べて');
      expect(input.Item?.RequestedAt).toBe(FIXED_NOW - 1000);
    });

    it('DynamoDB エラーは DatabaseError でラップ', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(
        repo.put({
          UserID: 'u1',
          CharacterID: 'hiyori',
          Query: 'q',
          RawText: 't',
          SourceUrls: [],
          Origin: 'auto',
        })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('listSince', () => {
    it('QueryCommand を ScanIndexForward=true で送信する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [] };
      });
      await repo.listSince('u1', 'hiyori', 0);
      const input = (sent[0] as QueryCommand).input;
      expect(input.ScanIndexForward).toBe(true);
      expect(input.FilterExpression).toBeUndefined();
    });

    it('sinceMs > 0 の場合 FilterExpression を付与する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [] };
      });
      await repo.listSince('u1', 'hiyori', FIXED_NOW - 1000);
      const input = (sent[0] as QueryCommand).input;
      expect(input.FilterExpression).toContain('CreatedAt');
      expect(input.ExpressionAttributeValues?.[':sinceMs']).toBe(FIXED_NOW - 1000);
    });

    it('アイテムをエンティティに変換して返す', async () => {
      const item = {
        PK: 'USER#u1',
        SK: 'CHAR#hiyori#WEBRAW#RAW-FIXED',
        Type: 'WebRaw',
        UserID: 'u1',
        CharacterID: 'hiyori',
        RawID: 'RAW-FIXED',
        Query: 'q',
        RawText: 't',
        SourceUrls: [],
        CreatedAt: FIXED_NOW,
      };
      const repo = makeRepo(async () => ({ Items: [item] }));
      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result).toHaveLength(1);
      expect(result[0].RawID).toBe('RAW-FIXED');
    });

    it('Origin が無い既存 item は "auto" にフォールバックする（甲-1 導入前の後方互換）', async () => {
      const item = {
        PK: 'USER#u1',
        SK: 'CHAR#hiyori#WEBRAW#RAW-FIXED',
        Type: 'WebRaw',
        UserID: 'u1',
        CharacterID: 'hiyori',
        RawID: 'RAW-FIXED',
        Query: 'q',
        RawText: 't',
        SourceUrls: [],
        CreatedAt: FIXED_NOW,
        // Origin 属性なし
      };
      const repo = makeRepo(async () => ({ Items: [item] }));
      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result[0].Origin).toBe('auto');
    });

    it('壊れた item はログ警告でスキップして処理を続行する', async () => {
      const broken = { PK: 'USER#u1', SK: 'CHAR#hiyori#WEBRAW#broken', Type: 'WebRaw' };
      const ok = {
        PK: 'USER#u1',
        SK: 'CHAR#hiyori#WEBRAW#ok',
        Type: 'WebRaw',
        UserID: 'u1',
        CharacterID: 'hiyori',
        RawID: 'ok',
        Query: 'q',
        RawText: 't',
        SourceUrls: [],
        CreatedAt: FIXED_NOW,
      };
      const repo = makeRepo(async () => ({ Items: [broken, ok] }));
      const result = await repo.listSince('u1', 'hiyori', 0);
      expect(result).toHaveLength(1);
      expect(result[0].RawID).toBe('ok');
    });

    it('ページネーション: LastEvaluatedKey があれば再クエリする', async () => {
      let call = 0;
      const repo = makeRepo(async () => {
        call++;
        if (call === 1) return { Items: [], LastEvaluatedKey: { PK: 'marker' } };
        return { Items: [] };
      });
      await repo.listSince('u1', 'hiyori', 0);
      expect(call).toBe(2);
    });

    it('DynamoDB エラーは DatabaseError でラップ', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(repo.listSince('u1', 'hiyori', 0)).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
