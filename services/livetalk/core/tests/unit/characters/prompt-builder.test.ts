import {
  getTimeOfDay,
  buildSystemPrompt,
  buildChatMessages,
} from '../../../src/characters/prompt-builder.js';
import { hiyori } from '../../../src/characters/hiyori.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';
import type { RetrievedTopic } from '../../../src/knowledge/retrieval.js';
import type { TopicEntity } from '../../../src/entities/topic.entity.js';
import type { SelfFactEntity } from '../../../src/entities/self-fact.entity.js';
import type { WebFactEntity } from '../../../src/entities/web-fact.entity.js';

const makeMsg = (role: 'user' | 'assistant', text: string, id = 'id1'): MessageEntity => ({
  UserID: 'u1',
  CharacterID: 'hiyori',
  MessageID: id,
  Role: role,
  Text: text,
  CreatedAt: 1_700_000_000_000,
  UpdatedAt: 1_700_000_000_000,
});

describe('getTimeOfDay', () => {
  it.each([
    [5, '朝'],
    [7, '朝'],
    [11, '朝'],
    [12, '昼'],
    [15, '昼'],
    [17, '昼'],
    [18, '夜'],
    [23, '夜'],
    [0, '夜'],
    [4, '夜'],
  ])('hour=%i → %s', (hour, expected) => {
    const date = new Date(2026, 0, 1, hour, 0, 0);
    expect(getTimeOfDay(date)).toBe(expected);
  });
});

describe('buildSystemPrompt', () => {
  it('キャラ名・時間帯・嗜好が含まれる', () => {
    const now = new Date(2026, 0, 1, 10, 0, 0); // 朝
    const prompt = buildSystemPrompt(hiyori, now);
    expect(prompt).toContain('桃瀬ひより');
    expect(prompt).toContain('朝');
    expect(prompt).toContain('スイーツ');
    expect(prompt).toContain('一人称は「私」');
  });

  it('夜の場合は「夜」が含まれる', () => {
    const now = new Date(2026, 0, 1, 22, 0, 0);
    const prompt = buildSystemPrompt(hiyori, now);
    expect(prompt).toContain('夜');
  });

  it('「質問攻め」に関するルールが含まれる', () => {
    const now = new Date();
    const prompt = buildSystemPrompt(hiyori, now);
    expect(prompt).toContain('質問攻めにしない');
  });

  it('空の preferences でもクラッシュしない', () => {
    const emptyCharacter = {
      ...hiyori,
      personality: {
        ...hiyori.personality,
        preferences: { likes: [], dislikes: [] },
      },
    };
    expect(() => buildSystemPrompt(emptyCharacter, new Date())).not.toThrow();
  });
});

describe('buildChatMessages', () => {
  it('system + history + current user message の順で返す', () => {
    const history = [
      makeMsg('user', 'おはよう', 'm1'),
      makeMsg('assistant', 'おはようです！', 'm2'),
    ];
    const messages = buildChatMessages(hiyori, new Date(), history, 'ありがとう');

    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'user', content: 'おはよう' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'おはようです！' });
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'ありがとう' });
  });

  it('history が空でも system + user の 2 件になる', () => {
    const messages = buildChatMessages(hiyori, new Date(), [], 'こんにちは');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'user', content: 'こんにちは' });
  });

  it('system prompt に現在の時間帯が反映される', () => {
    const morning = new Date(2026, 0, 1, 9, 0, 0);
    const messages = buildChatMessages(hiyori, morning, [], 'hi');
    expect(messages[0].content).toContain('朝');
  });

  it('history の Role が user/assistant 以外のメッセージはスキップされない（現実には存在しない）', () => {
    // MessageEntity の Role は 'user' | 'assistant' のユニオン型なので、これは型安全性の確認
    const history = [makeMsg('user', 'test')];
    const messages = buildChatMessages(hiyori, new Date(), history, 'reply');
    expect(messages.some((m) => m.content === 'test')).toBe(true);
  });
});

describe('buildSystemPrompt（lifecycleState）', () => {
  it('lifecycleState=sleeping のとき寝ぼけプロンプトが挿入される', () => {
    const prompt = buildSystemPrompt(hiyori, new Date(), 'sleeping');
    // 眠い状態・振る舞いの指示が含まれること（キャラ固有の口癖ワードは含まない）
    expect(prompt).toContain('眠く');
    expect(prompt).toContain('うとうと');
  });

  it('lifecycleState=sleeping のとき「むにゃ」などのキャラ固有ワードが含まれない', () => {
    const prompt = buildSystemPrompt(hiyori, new Date(), 'sleeping');
    expect(prompt).not.toContain('むにゃ');
  });

  it('lifecycleState=sleeping のとき短い返答の指示が含まれる', () => {
    const prompt = buildSystemPrompt(hiyori, new Date(), 'sleeping');
    expect(prompt).toContain('短く');
  });

  it('lifecycleState=awake のときは寝ぼけプロンプトが挿入されない', () => {
    const prompt = buildSystemPrompt(hiyori, new Date(), 'awake');
    expect(prompt).not.toContain('うとうと');
  });

  it('lifecycleState 未指定（undefined）のときは寝ぼけプロンプトが挿入されない', () => {
    const prompt = buildSystemPrompt(hiyori, new Date());
    expect(prompt).not.toContain('うとうと');
  });
});

describe('buildChatMessages（lifecycleState）', () => {
  it('lifecycleState=sleeping が system prompt に反映される', () => {
    const messages = buildChatMessages(hiyori, new Date(), [], 'hi', 'sleeping');
    // 眠い状態の指示が含まれること
    expect(messages[0].content).toContain('うとうと');
  });

  it('lifecycleState=awake は system prompt に寝ぼけ指示を含まない', () => {
    const messages = buildChatMessages(hiyori, new Date(), [], 'hi', 'awake');
    expect(messages[0].content).not.toContain('うとうと');
  });
});

describe('buildSystemPrompt（recentNotes / 感想連携）', () => {
  const makeNote = (subject: string, id = 'note-1') => ({
    UserID: 'u1',
    CharacterID: 'hiyori',
    NoteID: id,
    TopicID: 'topic-1',
    Subject: subject,
    Headline: '本文',
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  });

  it('recentNotes がある場合はノートのタイトルと感想連携の指示が含まれる', () => {
    const now = new Date(2026, 0, 1, 10, 0, 0);
    const prompt = buildSystemPrompt(hiyori, now, undefined, [makeNote('コーヒーの効能')]);
    expect(prompt).toContain('最近ユーザーに渡したノート');
    expect(prompt).toContain('- コーヒーの効能');
    expect(prompt).toContain('感想');
  });

  it('recentNotes が空の場合はノートセクションを含まない', () => {
    const now = new Date(2026, 0, 1, 10, 0, 0);
    const prompt = buildSystemPrompt(hiyori, now, undefined, []);
    expect(prompt).not.toContain('最近ユーザーに渡したノート');
  });

  it('buildChatMessages 経由でも recentNotes が system prompt に反映される', () => {
    const messages = buildChatMessages(hiyori, new Date(), [], 'あのノート良かったよ', undefined, [
      makeNote('コーヒーの効能'),
    ]);
    expect(messages[0].content).toContain('最近ユーザーに渡したノート');
    expect(messages[0].content).toContain('- コーヒーの効能');
  });
});

// ── Topic 想起（関連度 only）（リブトーク知識再設計 P2 / #3698）────────────────

function makeTopic(subject: string, id = 'topic-1'): TopicEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: id,
    Subject: subject,
    CanonicalSummary: `${subject} の要約`,
    Category: 'カテゴリ',
    Care: 1,
    Embedding: [0.1, 0.2],
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };
}

function makeSelfFact(text: string, topicId = 'topic-1'): SelfFactEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: topicId,
    FactID: 'fact-1',
    Text: text,
    Provenance: '',
    CreatedAt: 1_700_000_000_000,
  };
}

function makeWebFact(text: string, topicId = 'topic-1'): WebFactEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: topicId,
    FactID: 'wfact-1',
    Text: text,
    SourceUrls: [],
    Volatility: 'stable',
    ObservedAt: 1_700_000_000_000,
    CreatedAt: 1_700_000_000_000,
  };
}

function makeRetrievedTopic(
  subject: string,
  selfFacts: string[] = [],
  webFacts: string[] = []
): RetrievedTopic {
  return {
    topic: makeTopic(subject),
    selfFacts: selfFacts.map((t) => makeSelfFact(t)),
    webFacts: webFacts.map((t) => makeWebFact(t)),
    similarity: 0.9,
    via: 'direct',
  };
}

describe('buildSystemPrompt（retrievedTopics）', () => {
  it('retrievedTopics が空の場合はセクションがない', () => {
    const prompt = buildSystemPrompt(hiyori, new Date(), undefined, undefined, []);
    expect(prompt).not.toContain('今の話題に関連');
  });

  it('retrievedTopics が未指定の場合もセクションがない', () => {
    const prompt = buildSystemPrompt(hiyori, new Date());
    expect(prompt).not.toContain('今の話題に関連');
  });

  it('retrievedTopics がある場合、subject・SELF・WEB がセクションに含まれる', () => {
    const topics = [
      makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'], ['カフェインは覚醒作用がある']),
    ];
    const prompt = buildSystemPrompt(hiyori, new Date(), undefined, undefined, topics);
    expect(prompt).toContain('今の話題に関連');
    expect(prompt).toContain('■ コーヒー');
    expect(prompt).toContain('（あなたが聞いたこと）朝コーヒーを飲む');
    expect(prompt).toContain('（あなたが調べたこと）カフェインは覚醒作用がある');
  });

  it('SELF のみの Topic は WEB 行を出さない', () => {
    const topics = [makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'], [])];
    const prompt = buildSystemPrompt(hiyori, new Date(), undefined, undefined, topics);
    expect(prompt).toContain('（あなたが聞いたこと）朝コーヒーを飲む');
    expect(prompt).not.toContain('（あなたが調べたこと）');
  });

  it('WEB のみの Topic は SELF 行を出さない', () => {
    const topics = [makeRetrievedTopic('コーヒー', [], ['カフェインは覚醒作用がある'])];
    const prompt = buildSystemPrompt(hiyori, new Date(), undefined, undefined, topics);
    expect(prompt).toContain('（あなたが調べたこと）カフェインは覚醒作用がある');
    expect(prompt).not.toContain('（あなたが聞いたこと）');
  });

  it('複数 Topic が列挙される', () => {
    const topics = [
      makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む']),
      makeRetrievedTopic('ゲーム', ['RPGが好き']),
    ];
    topics[1].topic.TopicID = 'topic-2';
    const prompt = buildSystemPrompt(hiyori, new Date(), undefined, undefined, topics);
    expect(prompt).toContain('■ コーヒー');
    expect(prompt).toContain('■ ゲーム');
  });

  it('recentNotes セクションと共存できる', () => {
    const notes = [
      {
        UserID: 'u1',
        CharacterID: 'hiyori',
        NoteID: 'note-1',
        TopicID: 'topic-1',
        Subject: 'ケーキの話',
        Headline: '本文',
        CreatedAt: 1_700_000_000_000,
        UpdatedAt: 1_700_000_000_000,
      },
    ];
    const topics = [makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'])];
    const prompt = buildSystemPrompt(hiyori, new Date(), undefined, notes, topics);
    expect(prompt).toContain('最近ユーザーに渡したノート');
    expect(prompt).toContain('今の話題に関連');
  });

  // fresh-eyes レビュー由来の修正: SELF/WEB が両方 0 件の Topic は見出しごと出さない
  it('SELF/WEB が両方 0 件の Topic は見出しごと出ない', () => {
    const topics = [
      makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む']),
      makeRetrievedTopic('空の話題', [], []),
    ];
    topics[1].topic.TopicID = 'topic-2';
    const prompt = buildSystemPrompt(hiyori, new Date(), undefined, undefined, topics);
    expect(prompt).toContain('■ コーヒー');
    expect(prompt).not.toContain('■ 空の話題');
  });

  it('fact を持つ Topic のみが描画される（fact 0 件の Topic のみ混在時）', () => {
    const topics = [
      makeRetrievedTopic('空の話題1', [], []),
      makeRetrievedTopic('コーヒー', [], ['カフェインは覚醒作用がある']),
      makeRetrievedTopic('空の話題2', [], []),
    ];
    topics[1].topic.TopicID = 'topic-2';
    topics[2].topic.TopicID = 'topic-3';
    const prompt = buildSystemPrompt(hiyori, new Date(), undefined, undefined, topics);
    expect(prompt).toContain('今の話題に関連');
    expect(prompt).toContain('■ コーヒー');
    expect(prompt).not.toContain('■ 空の話題1');
    expect(prompt).not.toContain('■ 空の話題2');
  });

  it('全 Topic が fact 0 件ならセクション自体が出ない', () => {
    const topics = [
      makeRetrievedTopic('空の話題1', [], []),
      makeRetrievedTopic('空の話題2', [], []),
    ];
    topics[1].topic.TopicID = 'topic-2';
    const prompt = buildSystemPrompt(hiyori, new Date(), undefined, undefined, topics);
    expect(prompt).not.toContain('今の話題に関連');
    expect(prompt).not.toContain('■ 空の話題1');
    expect(prompt).not.toContain('■ 空の話題2');
  });
});

describe('buildChatMessages（retrievedTopics）', () => {
  it('retrievedTopics が渡されると system prompt に Topic セクションが注入される', () => {
    const topics = [makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'])];
    const messages = buildChatMessages(
      hiyori,
      new Date(),
      [],
      'おはよう',
      undefined,
      undefined,
      topics
    );
    expect(messages[0].content).toContain('今の話題に関連');
    expect(messages[0].content).toContain('■ コーヒー');
  });

  it('retrievedTopics 未指定の場合は Topic セクションがない', () => {
    const messages = buildChatMessages(hiyori, new Date(), [], 'おはよう');
    expect(messages[0].content).not.toContain('今の話題に関連');
  });
});
