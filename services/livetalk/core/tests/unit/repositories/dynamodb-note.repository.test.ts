import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
  Title: 'コーヒーの効能',
  Body: '本文。\n\nコメント。',
  RelatedKnowledgeIds: ['know-001'],
  RelatedCategory: 'コーヒー',
};

const baseItem = {
  PK: 'USER#u1',
  SK: 'CHAR#hiyori#NOTE#note-001',
  Type: 'Note',
  UserID: 'u1',
  CharacterID: 'hiyori',
  NoteID: 'note-001',
  Title: 'コーヒーの効能',
  Body: '本文。\n\nコメント。',
  RelatedKnowledgeIds: ['know-001'],
  RelatedCategory: 'コーヒー',
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
      expect(note?.Title).toBe('コーヒーの効能');
      expect(sent[0]).toBeInstanceOf(GetCommand);
    });

    it('Item が無ければ null を返す', async () => {
      const client = makeClient(async () => ({}));
      const repo = new DynamoDBNoteRepository(client as never, tableName, () => fixedNow);
      expect(
        await repo.get({ userId: 'u1', characterId: 'hiyori', noteId: 'missing' })
      ).toBeNull();
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
});
