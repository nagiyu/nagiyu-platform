import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '@nagiyu/common';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBNoteRepository } from '../../../src/repositories/dynamodb-note.repository.js';
import type { CreateNoteInput } from '../../../src/entities/note.entity.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

const fixedNow = 1_750_000_000_000;
const tableName = 'nagiyu-livetalk-dev';

const baseInput: CreateNoteInput = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  NoteID: 'note-001',
  TopicID: 'topic-001',
  Subject: 'コーヒーの効能',
  Headline: 'この前の話、気になって調べてみたよ。覚醒効果があるみたい！',
};

const baseItem = {
  PK: 'USER#u1',
  SK: 'CHAR#hiyori#NOTE#note-001',
  Type: 'Note',
  UserID: 'u1',
  CharacterID: 'hiyori',
  NoteID: 'note-001',
  TopicID: 'topic-001',
  Subject: 'コーヒーの効能',
  Headline: 'この前の話、気になって調べてみたよ。覚醒効果があるみたい！',
  CreatedAt: fixedNow,
  UpdatedAt: fixedNow,
};

// 旧設計（Knowledge 昇格方式）の Note item。TopicID/Subject/Headline を持たず、
// 代わりに Title/Body/RelatedCategory/RelatedKnowledgeIds を持つ（撤去済みフィールド構成）。
// dev テーブルに残存する破損/旧設計 item の再現に使う。
const legacyItem = {
  PK: 'USER#u1',
  SK: 'CHAR#hiyori#NOTE#legacy-001',
  Type: 'Note',
  UserID: 'u1',
  CharacterID: 'hiyori',
  NoteID: 'legacy-001',
  Title: '旧ノートのタイトル',
  Body: '旧ノートの本文',
  RelatedCategory: 'category-1',
  RelatedKnowledgeIds: ['k1', 'k2'],
  CreatedAt: fixedNow,
  UpdatedAt: fixedNow,
};

describe('DynamoDBNoteRepository', () => {
  describe('put', () => {
    it('PutCommand を送り CreatedAt / UpdatedAt を付与する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      const entity = await repo.put(baseInput);
      expect(entity.CreatedAt).toBe(fixedNow);
      expect(entity.UpdatedAt).toBe(fixedNow);
      expect(sent[0]).toBeInstanceOf(PutCommand);
      const input = (sent[0] as PutCommand).input;
      expect(input.Item?.SK).toBe('CHAR#hiyori#NOTE#note-001');
    });

    it('put 失敗時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('boom');
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);
      await expect(repo.put(baseInput)).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('list', () => {
    it('QueryCommand で降順取得する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Items: [baseItem] };
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      const list = await repo.list('u1', 'hiyori');
      expect(list).toHaveLength(1);
      expect(list[0].NoteID).toBe('note-001');
      expect(sent[0]).toBeInstanceOf(QueryCommand);
      expect((sent[0] as QueryCommand).input.ScanIndexForward).toBe(false);
    });

    it('list 失敗時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('boom');
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);
      await expect(repo.list('u1', 'hiyori')).rejects.toBeInstanceOf(DatabaseError);
    });

    it('旧設計（TopicID 無し）の item が混在してもスキップし正常な item のみ返す', async () => {
      const client = makeClient(async () => ({ Items: [baseItem, legacyItem] }));
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      const list = await repo.list('u1', 'hiyori');
      expect(list).toHaveLength(1);
      expect(list[0].NoteID).toBe('note-001');
    });

    it('旧設計 item のマップ失敗時は logger.warn で警告する', async () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const client = makeClient(async () => ({ Items: [baseItem, legacyItem] }));
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      await repo.list('u1', 'hiyori');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('ノート item のマップに失敗しました'),
        expect.objectContaining({
          userId: 'u1',
          characterId: 'hiyori',
          sk: 'CHAR#hiyori#NOTE#legacy-001',
        })
      );
      warnSpy.mockRestore();
    });
  });

  describe('get', () => {
    it('GetCommand で単一ノートを返す', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Item: baseItem };
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      const note = await repo.get({ userId: 'u1', characterId: 'hiyori', noteId: 'note-001' });
      expect(note?.Subject).toBe('コーヒーの効能');
      expect(sent[0]).toBeInstanceOf(GetCommand);
    });

    it('Item が無ければ null を返す', async () => {
      const client = makeClient(async () => ({}));
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);
      expect(await repo.get({ userId: 'u1', characterId: 'hiyori', noteId: 'missing' })).toBeNull();
    });

    it('get 失敗時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('boom');
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);
      await expect(
        repo.get({ userId: 'u1', characterId: 'hiyori', noteId: 'note-001' })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('listAll', () => {
    it('複数ページを結合して全件返す（LastEvaluatedKey の連鎖）', async () => {
      let callCount = 0;
      const page1Item = { ...baseItem, NoteID: 'note-001', SK: 'CHAR#hiyori#NOTE#note-001' };
      const page2Item = {
        ...baseItem,
        NoteID: 'note-002',
        SK: 'CHAR#hiyori#NOTE#note-002',
        CreatedAt: fixedNow - 1000,
      };
      const client = makeClient(async () => {
        callCount++;
        if (callCount === 1) {
          return { Items: [page1Item], LastEvaluatedKey: { PK: 'USER#u1', SK: 'cursor' } };
        }
        return { Items: [page2Item] };
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      const list = await repo.listAll('u1', 'hiyori');
      expect(list).toHaveLength(2);
      // 2 ページ分クエリされていること
      expect(callCount).toBe(2);
    });

    it('100 件を超えても全件返す（件数制限なし）', async () => {
      // 1 ページ目に 100 件 + LastEvaluatedKey、2 ページ目に 50 件
      let callCount = 0;
      const client = makeClient(async () => {
        callCount++;
        if (callCount === 1) {
          const items = Array.from({ length: 100 }, (_, i) => ({
            ...baseItem,
            NoteID: `note-${i}`,
            SK: `CHAR#hiyori#NOTE#note-${i}`,
          }));
          return { Items: items, LastEvaluatedKey: { PK: 'USER#u1', SK: 'cursor' } };
        }
        const items = Array.from({ length: 50 }, (_, i) => ({
          ...baseItem,
          NoteID: `note-extra-${i}`,
          SK: `CHAR#hiyori#NOTE#note-extra-${i}`,
        }));
        return { Items: items };
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      const list = await repo.listAll('u1', 'hiyori');
      // list() と異なり 100 件で打ち切らず全 150 件を返す
      expect(list).toHaveLength(150);
      expect(callCount).toBe(2);
    });

    it('LastEvaluatedKey がなければ 1 ページで終了する', async () => {
      const client = makeClient(async () => ({ Items: [baseItem] }));
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      const list = await repo.listAll('u1', 'hiyori');
      expect(list).toHaveLength(1);
    });

    it('listAll 失敗時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('boom');
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);
      await expect(repo.listAll('u1', 'hiyori')).rejects.toBeInstanceOf(DatabaseError);
    });

    it('複数ページにまたがっても旧設計 item をスキップし正常な item のみ全件返す', async () => {
      let callCount = 0;
      const client = makeClient(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            Items: [baseItem, legacyItem],
            LastEvaluatedKey: { PK: 'USER#u1', SK: 'cursor' },
          };
        }
        const page2LegacyItem = {
          ...legacyItem,
          SK: 'CHAR#hiyori#NOTE#legacy-002',
          NoteID: 'legacy-002',
        };
        const page2NormalItem = {
          ...baseItem,
          SK: 'CHAR#hiyori#NOTE#note-002',
          NoteID: 'note-002',
        };
        return { Items: [page2LegacyItem, page2NormalItem] };
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      const list = await repo.listAll('u1', 'hiyori');
      expect(callCount).toBe(2);
      expect(list).toHaveLength(2);
      expect(list.map((note) => note.NoteID).sort()).toEqual(['note-001', 'note-002']);
    });
  });

  describe('listRecent', () => {
    it('threshold より新しいノートのみ返す', async () => {
      const oldItem = {
        ...baseItem,
        SK: 'CHAR#hiyori#NOTE#old',
        NoteID: 'old',
        CreatedAt: fixedNow - 10 * 24 * 60 * 60 * 1000,
      };
      const client = makeClient(async () => ({ Items: [baseItem, oldItem] }));
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      const recent = await repo.listRecent('u1', 'hiyori', { days: 7 });
      expect(recent).toHaveLength(1);
      expect(recent[0].NoteID).toBe('note-001');
    });
  });

  describe('updateReaction', () => {
    it('UpdateCommand で Reaction / UpdatedAt を更新する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      await repo.updateReaction(
        { userId: 'u1', characterId: 'hiyori', noteId: 'note-001' },
        'すごく良かった！'
      );

      expect(sent[0]).toBeInstanceOf(UpdateCommand);
      const input = (sent[0] as UpdateCommand).input;
      expect(input.Key).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#NOTE#note-001' });
      expect(input.ExpressionAttributeValues).toEqual({
        ':reaction': 'すごく良かった！',
        ':updatedAt': fixedNow,
      });
    });

    it('対象が存在しない（ConditionalCheckFailedException）場合は no-op', async () => {
      const client = makeClient(async () => {
        const error = new Error('conditional check failed');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);

      await expect(
        repo.updateReaction({ userId: 'u1', characterId: 'hiyori', noteId: 'missing' }, '感想')
      ).resolves.toBeUndefined();
    });

    it('updateReaction 失敗時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('boom');
      });
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);
      await expect(
        repo.updateReaction({ userId: 'u1', characterId: 'hiyori', noteId: 'note-001' }, '感想')
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
