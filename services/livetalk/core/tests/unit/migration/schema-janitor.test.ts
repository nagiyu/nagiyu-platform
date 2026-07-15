import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  classifySchemaItem,
  findSchemaItems,
  deleteSchemaItems,
} from '../../../src/migration/schema-janitor.js';
import type { DynamoDBItem } from '@nagiyu/aws';

const TABLE = 'nagiyu-livetalk-test';
const USER_ID = 'google-user-001';
const CHARACTER_ID = 'hiyori';

function makeDocClient(mockSend: jest.Mock) {
  return { send: mockSend } as unknown as DynamoDBDocumentClient;
}

function makeItem(sk: string, extra: Record<string, unknown> = {}): DynamoDBItem {
  return {
    PK: `USER#${USER_ID}`,
    SK: sk,
    Type: 'x',
    CreatedAt: 1,
    UpdatedAt: 1,
    ...extra,
  };
}

describe('classifySchemaItem', () => {
  describe('旧スキーマ（old）', () => {
    it('KNOWLEDGE / MEM / INTEREST / MEMORY#SUMMARY / 旧 Note（TopicID 無し）を旧スキーマと判定する', () => {
      expect(classifySchemaItem(`CHAR#${CHARACTER_ID}#KNOWLEDGE#01ULID`, makeItem(''), 'old')).toBe(
        true
      );
      expect(
        classifySchemaItem(`CHAR#${CHARACTER_ID}#MEM#B#趣味#01ULID`, makeItem(''), 'old')
      ).toBe(true);
      expect(classifySchemaItem(`CHAR#${CHARACTER_ID}#INTEREST#趣味`, makeItem(''), 'old')).toBe(
        true
      );
      expect(classifySchemaItem(`CHAR#${CHARACTER_ID}#MEMORY#SUMMARY`, makeItem(''), 'old')).toBe(
        true
      );
      const oldNoteSk = `CHAR#${CHARACTER_ID}#NOTE#01ULID`;
      expect(classifySchemaItem(oldNoteSk, makeItem(oldNoteSk), 'old')).toBe(true);
    });

    it('新 Note（TopicID 有り）は旧スキーマと判定しない', () => {
      const sk = `CHAR#${CHARACTER_ID}#NOTE#01ULID`;
      const item = makeItem(sk, { TopicID: 'TOPIC-1' });
      expect(classifySchemaItem(sk, item, 'old')).toBe(false);
    });

    it('新スキーマの SK は旧スキーマと判定しない', () => {
      expect(
        classifySchemaItem(`CHAR#${CHARACTER_ID}#TOPIC#T1#META`, makeItem(''), 'old')
      ).toBe(false);
      expect(classifySchemaItem(`CHAR#${CHARACTER_ID}#WEBRAW#01ULID`, makeItem(''), 'old')).toBe(
        false
      );
      expect(classifySchemaItem(`CHAR#${CHARACTER_ID}#CURSOR`, makeItem(''), 'old')).toBe(false);
    });
  });

  describe('新スキーマ（new）', () => {
    it('TOPIC の META/SELF/WEB・WEBRAW・新 Note（TopicID 有り）・CURSOR を新スキーマと判定する', () => {
      expect(
        classifySchemaItem(`CHAR#${CHARACTER_ID}#TOPIC#T1#META`, makeItem(''), 'new')
      ).toBe(true);
      expect(
        classifySchemaItem(`CHAR#${CHARACTER_ID}#TOPIC#T1#SELF#F1`, makeItem(''), 'new')
      ).toBe(true);
      expect(
        classifySchemaItem(`CHAR#${CHARACTER_ID}#TOPIC#T1#WEB#F1`, makeItem(''), 'new')
      ).toBe(true);
      expect(classifySchemaItem(`CHAR#${CHARACTER_ID}#WEBRAW#01ULID`, makeItem(''), 'new')).toBe(
        true
      );
      const newNoteSk = `CHAR#${CHARACTER_ID}#NOTE#01ULID`;
      expect(
        classifySchemaItem(newNoteSk, makeItem(newNoteSk, { TopicID: 'TOPIC-1' }), 'new')
      ).toBe(true);
      expect(classifySchemaItem(`CHAR#${CHARACTER_ID}#CURSOR`, makeItem(''), 'new')).toBe(true);
    });

    it('旧 Note（TopicID 無し）は新スキーマと判定しない', () => {
      const sk = `CHAR#${CHARACTER_ID}#NOTE#01ULID`;
      expect(classifySchemaItem(sk, makeItem(sk), 'new')).toBe(false);
    });

    it('旧スキーマの SK は新スキーマと判定しない', () => {
      expect(
        classifySchemaItem(`CHAR#${CHARACTER_ID}#KNOWLEDGE#01ULID`, makeItem(''), 'new')
      ).toBe(false);
    });
  });

  describe('触ってはいけない Type（fail-safe）', () => {
    it.each([
      `CHAR#${CHARACTER_ID}#MSG#01ULID`,
      `CHAR#${CHARACTER_ID}#STATE`,
      `CHAR#${CHARACTER_ID}#LIFECYCLE`,
      `CHAR#${CHARACTER_ID}#STUDY#01ULID`,
      'CHATLOCK',
      'RATELIMIT#minute#123',
      'SAFETY#01ULID',
      'PUSH_SUBSCRIPTION#01ULID',
      'NOTIF#01ULID',
      'PROFILE',
    ])('%s は old/new どちらにも該当しない', (sk) => {
      expect(classifySchemaItem(sk, makeItem(sk), 'old')).toBe(false);
      expect(classifySchemaItem(sk, makeItem(sk), 'new')).toBe(false);
    });
  });
});

describe('findSchemaItems / deleteSchemaItems', () => {
  it('findSchemaItems は PK 配下を CHAR#<characterId># でクエリし、ホワイトリスト一致分だけ返す', async () => {
    const mockSend = jest.fn().mockResolvedValueOnce({
      Items: [
        makeItem(`CHAR#${CHARACTER_ID}#KNOWLEDGE#01ULID`),
        makeItem(`CHAR#${CHARACTER_ID}#MSG#01ULID`), // 保護対象。混入していても除外される
        makeItem(`CHAR#${CHARACTER_ID}#MEM#B#趣味#01ULID`),
      ],
    });

    const items = await findSchemaItems(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID, 'old');

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.SK)).toEqual([
      `CHAR#${CHARACTER_ID}#KNOWLEDGE#01ULID`,
      `CHAR#${CHARACTER_ID}#MEM#B#趣味#01ULID`,
    ]);
  });

  it('対象 0 件のときは BatchWrite を呼ばず deletedCount=0 を返す', async () => {
    const mockSend = jest.fn().mockResolvedValueOnce({ Items: [] });
    const result = await deleteSchemaItems(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID, 'old');
    expect(result).toEqual({ deletedCount: 0 });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('対象アイテムを BatchWrite で削除し、削除件数を返す', async () => {
    const mockSend = jest
      .fn()
      .mockResolvedValueOnce({
        Items: [
          makeItem(`CHAR#${CHARACTER_ID}#KNOWLEDGE#01ULID`),
          makeItem(`CHAR#${CHARACTER_ID}#MEM#B#趣味#01ULID`),
        ],
      })
      .mockResolvedValueOnce({}); // BatchWriteCommand: UnprocessedItems 無し

    const result = await deleteSchemaItems(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID, 'old');

    expect(result).toEqual({ deletedCount: 2 });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('wipe 後（対象 0 件）に再実行しても常に deletedCount=0 で冪等', async () => {
    const mockSend = jest.fn().mockResolvedValue({ Items: [] });
    const first = await deleteSchemaItems(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID, 'new');
    const second = await deleteSchemaItems(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID, 'new');
    expect(first).toEqual({ deletedCount: 0 });
    expect(second).toEqual({ deletedCount: 0 });
  });
});
