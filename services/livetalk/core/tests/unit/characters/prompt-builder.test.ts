import { jst } from '../../helpers/jst.js';
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
  userId: 'u1',
  characterId: 'hiyori',
  messageId: id,
  role: role,
  text: text,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
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
    const date = jst(2026, 0, 1, hour, 0, 0);
    expect(getTimeOfDay(date)).toBe(expected);
  });
});

describe('buildSystemPrompt', () => {
  it('キャラ名・時間帯・嗜好が含まれる', () => {
    const now = jst(2026, 0, 1, 10, 0, 0); // 朝
    const prompt = buildSystemPrompt(hiyori, now);
    expect(prompt).toContain('桃瀬ひより');
    expect(prompt).toContain('朝');
    expect(prompt).toContain('スイーツ');
    expect(prompt).toContain('一人称は「私」');
  });

  it('夜の場合は「夜」が含まれる', () => {
    const now = jst(2026, 0, 1, 22, 0, 0);
    const prompt = buildSystemPrompt(hiyori, now);
    expect(prompt).toContain('夜');
  });

  it('今日の日付(曜日つき)が時間帯の行の直前に入る', () => {
    const prompt = buildSystemPrompt(hiyori, jst(2026, 10, 20, 10));
    expect(prompt).toContain('今日の日付: 2026年11月20日(金)\n現在の時間帯: 朝');
  });

  it('日付の扱いのルールが常に入る', () => {
    const prompt = buildSystemPrompt(hiyori, jst(2026, 10, 20, 10));
    expect(prompt).toContain('日付の扱い:');
    expect(prompt).toContain('過去・今日・これから');
    expect(prompt).toContain('終わったイベントや過ぎた予定を、これからのこととして話さない');
    expect(prompt).toContain('今日の日付に置き換えて考える');
    expect(prompt).toContain('時期を決めつけない');
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
    const morning = jst(2026, 0, 1, 9, 0, 0);
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
    userId: 'u1',
    characterId: 'hiyori',
    noteId: id,
    topicId: 'topic-1',
    subject: subject,
    headline: '本文',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  });

  it('recentNotes がある場合はノートのタイトルと感想連携の指示が含まれる', () => {
    const now = jst(2026, 0, 1, 10, 0, 0);
    const prompt = buildSystemPrompt(hiyori, now, undefined, [makeNote('コーヒーの効能')]);
    expect(prompt).toContain('最近ユーザーに渡したノート');
    expect(prompt).toContain('- コーヒーの効能');
    expect(prompt).toContain('感想');
  });

  it('recentNotes が空の場合はノートセクションを含まない', () => {
    const now = jst(2026, 0, 1, 10, 0, 0);
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
    userId: 'u1',
    characterId: 'hiyori',
    topicId: id,
    subject: subject,
    canonicalSummary: `${subject} の要約`,
    category: 'カテゴリ',
    care: 1,
    embedding: [0.1, 0.2],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

function makeSelfFact(text: string, topicId = 'topic-1'): SelfFactEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: topicId,
    factId: 'fact-1',
    text: text,
    provenance: '',
    createdAt: jst(2026, 10, 5, 12).getTime(),
  };
}

function makeWebFact(text: string, topicId = 'topic-1'): WebFactEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: topicId,
    factId: 'wfact-1',
    text: text,
    sourceUrls: [],
    volatility: 'stable',
    observedAt: jst(2026, 10, 8, 12).getTime(),
    createdAt: jst(2026, 10, 8, 12).getTime(),
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

const NOW = jst(2026, 10, 20, 10);

describe('buildSystemPrompt（retrievedTopics）', () => {
  it('retrievedTopics が空の場合はセクションがない', () => {
    const prompt = buildSystemPrompt(hiyori, NOW, undefined, undefined, []);
    expect(prompt).not.toContain('今の話題に関連');
  });

  it('retrievedTopics が未指定の場合もセクションがない', () => {
    const prompt = buildSystemPrompt(hiyori, NOW);
    expect(prompt).not.toContain('今の話題に関連');
  });

  it('retrievedTopics がある場合、subject・SELF・WEB がセクションに含まれる', () => {
    const topics = [
      makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'], ['カフェインは覚醒作用がある']),
    ];
    const prompt = buildSystemPrompt(hiyori, NOW, undefined, undefined, topics);
    expect(prompt).toContain('今の話題に関連');
    expect(prompt).toContain('■ コーヒー');
    expect(prompt).toContain('（あなたが11月5日に聞いたこと）朝コーヒーを飲む');
    expect(prompt).toContain('（あなたが11月8日に調べたこと）カフェインは覚醒作用がある');
  });

  it('年が違う事実は年つきの日付になる', () => {
    const topics = [makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'], ['カフェイン'])];
    const prompt = buildSystemPrompt(hiyori, jst(2027, 0, 2), undefined, undefined, topics);
    expect(prompt).toContain('（あなたが2026年11月5日に聞いたこと）');
    expect(prompt).toContain('（あなたが2026年11月8日に調べたこと）');
  });

  it('SELF のみの Topic は WEB 行を出さない', () => {
    const topics = [makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'], [])];
    const prompt = buildSystemPrompt(hiyori, NOW, undefined, undefined, topics);
    expect(prompt).toContain('（あなたが11月5日に聞いたこと）朝コーヒーを飲む');
    expect(prompt).not.toContain('（あなたが11月8日に調べたこと）');
  });

  it('WEB のみの Topic は SELF 行を出さない', () => {
    const topics = [makeRetrievedTopic('コーヒー', [], ['カフェインは覚醒作用がある'])];
    const prompt = buildSystemPrompt(hiyori, NOW, undefined, undefined, topics);
    expect(prompt).toContain('（あなたが11月8日に調べたこと）カフェインは覚醒作用がある');
    expect(prompt).not.toContain('（あなたが11月5日に聞いたこと）');
  });

  it('複数 Topic が列挙される', () => {
    const topics = [
      makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む']),
      makeRetrievedTopic('ゲーム', ['RPGが好き']),
    ];
    topics[1].topic.topicId = 'topic-2';
    const prompt = buildSystemPrompt(hiyori, NOW, undefined, undefined, topics);
    expect(prompt).toContain('■ コーヒー');
    expect(prompt).toContain('■ ゲーム');
  });

  it('recentNotes セクションと共存できる', () => {
    const notes = [
      {
        userId: 'u1',
        characterId: 'hiyori',
        noteId: 'note-1',
        topicId: 'topic-1',
        subject: 'ケーキの話',
        headline: '本文',
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ];
    const topics = [makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'])];
    const prompt = buildSystemPrompt(hiyori, NOW, undefined, notes, topics);
    expect(prompt).toContain('最近ユーザーに渡したノート');
    expect(prompt).toContain('今の話題に関連');
  });

  // fresh-eyes レビュー由来の修正: SELF/WEB が両方 0 件の Topic は見出しごと出さない
  it('SELF/WEB が両方 0 件の Topic は見出しごと出ない', () => {
    const topics = [
      makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む']),
      makeRetrievedTopic('空の話題', [], []),
    ];
    topics[1].topic.topicId = 'topic-2';
    const prompt = buildSystemPrompt(hiyori, NOW, undefined, undefined, topics);
    expect(prompt).toContain('■ コーヒー');
    expect(prompt).not.toContain('■ 空の話題');
  });

  it('fact を持つ Topic のみが描画される（fact 0 件の Topic のみ混在時）', () => {
    const topics = [
      makeRetrievedTopic('空の話題1', [], []),
      makeRetrievedTopic('コーヒー', [], ['カフェインは覚醒作用がある']),
      makeRetrievedTopic('空の話題2', [], []),
    ];
    topics[1].topic.topicId = 'topic-2';
    topics[2].topic.topicId = 'topic-3';
    const prompt = buildSystemPrompt(hiyori, NOW, undefined, undefined, topics);
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
    topics[1].topic.topicId = 'topic-2';
    const prompt = buildSystemPrompt(hiyori, NOW, undefined, undefined, topics);
    expect(prompt).not.toContain('今の話題に関連');
    expect(prompt).not.toContain('■ 空の話題1');
    expect(prompt).not.toContain('■ 空の話題2');
  });
});

describe('buildChatMessages（retrievedTopics）', () => {
  it('retrievedTopics が渡されると system prompt に Topic セクションが注入される', () => {
    const topics = [makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'])];
    const messages = buildChatMessages(hiyori, NOW, [], 'おはよう', undefined, undefined, topics);
    expect(messages[0].content).toContain('今の話題に関連');
    expect(messages[0].content).toContain('■ コーヒー');
  });

  it('retrievedTopics 未指定の場合は Topic セクションがない', () => {
    const messages = buildChatMessages(hiyori, NOW, [], 'おはよう');
    expect(messages[0].content).not.toContain('今の話題に関連');
  });
});
