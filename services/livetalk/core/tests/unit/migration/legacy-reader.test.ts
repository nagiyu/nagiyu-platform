import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { readLegacyData } from '../../../src/migration/legacy-reader.js';

const TABLE = 'nagiyu-livetalk-test';
const USER_ID = 'google-user-001';
const CHARACTER_ID = 'hiyori';

function makeDocClient(mockSend: jest.Mock) {
  return { send: mockSend } as unknown as DynamoDBDocumentClient;
}

describe('readLegacyData', () => {
  it('Memory / Knowledge / InterestCategory を分類してパースする', async () => {
    const mockSend = jest.fn().mockResolvedValueOnce({
      Items: [
        {
          PK: `USER#${USER_ID}`,
          SK: `CHAR#${CHARACTER_ID}#MEM#B#趣味#01ULID`,
          Content: 'コーヒーが好き',
          Category: '趣味',
          Tier: 'B',
          Confidence: 0.8,
          Embedding: [1, 0],
          ReferencedCount: 3,
        },
        {
          PK: `USER#${USER_ID}`,
          SK: `CHAR#${CHARACTER_ID}#KNOWLEDGE#01ULID2`,
          Topic: 'コーヒー 効能',
          Summary: 'コーヒーには覚醒作用がある',
          SourceUrls: ['https://example.com'],
          RawComment: '',
          RelatedCategory: '趣味',
        },
        {
          PK: `USER#${USER_ID}`,
          SK: `CHAR#${CHARACTER_ID}#INTEREST#趣味`,
          Category: '趣味',
          Weight: 2.5,
          Embedding: [0, 1],
        },
        // 破棄対象: MemorySummary
        {
          PK: `USER#${USER_ID}`,
          SK: `CHAR#${CHARACTER_ID}#MEMORY#SUMMARY`,
          Summary: '過去の要約',
        },
        // 破棄対象: 旧 Note（TopicID を持たない）
        {
          PK: `USER#${USER_ID}`,
          SK: `CHAR#${CHARACTER_ID}#NOTE#01ULID3`,
          Title: '旧ノート',
          Body: '内容',
        },
      ],
    });

    const result = await readLegacyData(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID);

    expect(result.memories).toEqual([
      { Content: 'コーヒーが好き', Category: '趣味', Embedding: [1, 0], ReferencedCount: 3 },
    ]);
    expect(result.knowledge).toEqual([
      {
        Topic: 'コーヒー 効能',
        Summary: 'コーヒーには覚醒作用がある',
        SourceUrls: ['https://example.com'],
        RawComment: '',
        RelatedCategory: '趣味',
      },
    ]);
    expect(result.interests).toEqual([{ Category: '趣味', Weight: 2.5, Embedding: [0, 1] }]);
  });

  it('必須属性（Content/Summary/Category）が欠けたアイテムはスキップする', async () => {
    const mockSend = jest.fn().mockResolvedValueOnce({
      Items: [
        // Content 無し（欠損）
        {
          PK: `USER#${USER_ID}`,
          SK: `CHAR#${CHARACTER_ID}#MEM#B#趣味#01ULID`,
          Category: '趣味',
        },
        // Summary 無し（欠損）
        {
          PK: `USER#${USER_ID}`,
          SK: `CHAR#${CHARACTER_ID}#KNOWLEDGE#01ULID2`,
          Topic: 'テスト',
        },
        // Category 無し（欠損）
        {
          PK: `USER#${USER_ID}`,
          SK: `CHAR#${CHARACTER_ID}#INTEREST#`,
          Weight: 1,
        },
      ],
    });

    const result = await readLegacyData(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID);

    expect(result.memories).toHaveLength(0);
    expect(result.knowledge).toHaveLength(0);
    expect(result.interests).toHaveLength(0);
  });

  it('欠損した任意属性（Category/Embedding/ReferencedCount 等）は安全なデフォルトにフォールバックする', async () => {
    const mockSend = jest.fn().mockResolvedValueOnce({
      Items: [
        {
          PK: `USER#${USER_ID}`,
          SK: `CHAR#${CHARACTER_ID}#MEM#B#趣味#01ULID`,
          Content: '記憶本文のみ',
          // Category / Embedding / ReferencedCount は欠損
        },
      ],
    });

    const result = await readLegacyData(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID);

    expect(result.memories).toEqual([
      { Content: '記憶本文のみ', Category: '', Embedding: [], ReferencedCount: 0 },
    ]);
  });

  it('ページネーション（LastEvaluatedKey）で全ページ分を集約する', async () => {
    const mockSend = jest
      .fn()
      .mockResolvedValueOnce({
        Items: [
          {
            PK: `USER#${USER_ID}`,
            SK: `CHAR#${CHARACTER_ID}#MEM#B#趣味#01ULID`,
            Content: '1件目',
          },
        ],
        LastEvaluatedKey: { PK: `USER#${USER_ID}`, SK: 'x' },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            PK: `USER#${USER_ID}`,
            SK: `CHAR#${CHARACTER_ID}#MEM#B#趣味#01ULID2`,
            Content: '2件目',
          },
        ],
      });

    const result = await readLegacyData(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result.memories.map((m) => m.Content)).toEqual(['1件目', '2件目']);
  });

  it('Items が 0 件でも空の結果を返す', async () => {
    const mockSend = jest.fn().mockResolvedValueOnce({ Items: [] });
    const result = await readLegacyData(makeDocClient(mockSend), TABLE, USER_ID, CHARACTER_ID);
    expect(result).toEqual({ memories: [], knowledge: [], interests: [] });
  });
});
