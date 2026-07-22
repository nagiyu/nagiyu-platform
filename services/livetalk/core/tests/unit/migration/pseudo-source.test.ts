import {
  buildPseudoMessages,
  buildPseudoWebRaws,
  chunkPseudoSources,
} from '../../../src/migration/pseudo-source.js';
import type {
  LegacyKnowledgeEntity,
  LegacyMemoryEntity,
} from '../../../src/migration/legacy-types.js';

const USER_ID = 'u1';
const CHARACTER_ID = 'hiyori';
const BASE_TIMESTAMP = 1_700_000_000_000;

describe('buildPseudoMessages', () => {
  it('Memory を Role=user の擬似メッセージへ写像する（Tier/Confidence は捨てる）', () => {
    const memories: LegacyMemoryEntity[] = [
      { Content: 'コーヒーが好き', Category: '趣味', Embedding: [1, 0], ReferencedCount: 3 },
    ];

    const [message] = buildPseudoMessages(
      memories,
      USER_ID,
      CHARACTER_ID,
      BASE_TIMESTAMP,
      () => 'ULID-1'
    );

    expect(message).toEqual({
      UserID: USER_ID,
      CharacterID: CHARACTER_ID,
      MessageID: 'ULID-1',
      Role: 'user',
      Text: 'コーヒーが好き',
      CreatedAt: BASE_TIMESTAMP,
      UpdatedAt: BASE_TIMESTAMP,
    });
  });

  it('CreatedAt は baseTimestamp からの連番で単調増加する', () => {
    const memories: LegacyMemoryEntity[] = [
      { Content: '1件目', Category: '', Embedding: [], ReferencedCount: 0 },
      { Content: '2件目', Category: '', Embedding: [], ReferencedCount: 0 },
    ];
    const messages = buildPseudoMessages(memories, USER_ID, CHARACTER_ID, BASE_TIMESTAMP);
    expect(messages[0].CreatedAt).toBe(BASE_TIMESTAMP);
    expect(messages[1].CreatedAt).toBe(BASE_TIMESTAMP + 1);
  });
});

describe('buildPseudoWebRaws', () => {
  it('Knowledge を擬似 webraw へ写像する（RawComment があれば併記）', () => {
    const knowledge: LegacyKnowledgeEntity[] = [
      {
        Topic: 'コーヒー 効能',
        Summary: 'コーヒーには覚醒作用がある',
        SourceUrls: ['https://example.com'],
        RawComment: '眠気覚ましに飲んでいる',
        RelatedCategory: '趣味',
      },
    ];

    const [webRaw] = buildPseudoWebRaws(
      knowledge,
      USER_ID,
      CHARACTER_ID,
      BASE_TIMESTAMP,
      () => 'ULID-W1'
    );

    expect(webRaw).toEqual({
      UserID: USER_ID,
      CharacterID: CHARACTER_ID,
      RawID: 'ULID-W1',
      Query: 'コーヒー 効能',
      RawText: 'コーヒーには覚醒作用がある\n眠気覚ましに飲んでいる',
      SourceUrls: ['https://example.com'],
      Origin: 'auto',
      CreatedAt: BASE_TIMESTAMP,
    });
  });

  it('RawComment が空文字なら Summary のみを RawText にする', () => {
    const knowledge: LegacyKnowledgeEntity[] = [
      {
        Topic: 'トピック',
        Summary: '要約のみ',
        SourceUrls: [],
        RawComment: '',
        RelatedCategory: '',
      },
    ];
    const [webRaw] = buildPseudoWebRaws(knowledge, USER_ID, CHARACTER_ID, BASE_TIMESTAMP);
    expect(webRaw.RawText).toBe('要約のみ');
  });
});

describe('chunkPseudoSources', () => {
  it('結合ストリームを chunkSize 件ずつに分割する', () => {
    const messages = buildPseudoMessages(
      Array.from({ length: 3 }, (_, i) => ({
        Content: `メッセージ${i}`,
        Category: '',
        Embedding: [],
        ReferencedCount: 0,
      })),
      USER_ID,
      CHARACTER_ID,
      BASE_TIMESTAMP
    );
    const webRaws = buildPseudoWebRaws(
      Array.from({ length: 2 }, (_, i) => ({
        Topic: `トピック${i}`,
        Summary: `要約${i}`,
        SourceUrls: [],
        RawComment: '',
        RelatedCategory: '',
      })),
      USER_ID,
      CHARACTER_ID,
      BASE_TIMESTAMP + 100
    );

    const chunks = chunkPseudoSources(messages, webRaws, 2);

    // 結合ストリーム = [msg0, msg1, msg2, web0, web1] を 2 件ずつに分割
    expect(chunks).toHaveLength(3);
    expect(chunks[0].messages).toHaveLength(2);
    expect(chunks[0].webRaws).toHaveLength(0);
    expect(chunks[1].messages).toHaveLength(1);
    expect(chunks[1].webRaws).toHaveLength(1);
    expect(chunks[2].messages).toHaveLength(0);
    expect(chunks[2].webRaws).toHaveLength(1);
  });

  it('メッセージ・webraw が共に 0 件なら空配列を返す', () => {
    expect(chunkPseudoSources([], [], 20)).toEqual([]);
  });
});
