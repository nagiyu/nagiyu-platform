import {
  getTimeOfDay,
  buildSystemPrompt,
  buildChatMessages,
} from '../../../src/characters/prompt-builder.js';
import { hiyori } from '../../../src/characters/hiyori.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';
import type { RetrievedMemory } from '../../../src/memory/types.js';
import type { MemoryEntity } from '../../../src/entities/memory.entity.js';

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

function makeRetrievedMemory(content: string, tier: 'A' | 'B' = 'B'): RetrievedMemory {
  const memory: MemoryEntity = {
    UserID: 'u1',
    CharacterID: 'hiyori',
    MemoryID: 'mem-001',
    Tier: tier,
    Category: 'food',
    Content: content,
    Confidence: 0.8,
    ReferencedCount: 0,
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };
  return { memory, similarity: tier === 'A' ? 1.0 : 0.9 };
}

describe('buildSystemPrompt（retrievedMemories）', () => {
  it('retrievedMemories が空の場合は「あなたが覚えていること」セクションがない', () => {
    const prompt = buildSystemPrompt(hiyori, new Date(), []);
    expect(prompt).not.toContain('あなたが覚えていること');
  });

  it('retrievedMemories が未指定の場合もセクションがない', () => {
    const prompt = buildSystemPrompt(hiyori, new Date());
    expect(prompt).not.toContain('あなたが覚えていること');
  });

  it('retrievedMemories がある場合はセクションが追加される', () => {
    const memories = [makeRetrievedMemory('コーヒーが好き', 'B')];
    const prompt = buildSystemPrompt(hiyori, new Date(), memories);
    expect(prompt).toContain('あなたが覚えていること');
    expect(prompt).toContain('- コーヒーが好き');
  });

  it('複数の記憶が列挙される', () => {
    const memories = [
      makeRetrievedMemory('名前は田中', 'A'),
      makeRetrievedMemory('コーヒーが好き', 'B'),
    ];
    const prompt = buildSystemPrompt(hiyori, new Date(), memories);
    expect(prompt).toContain('- 名前は田中');
    expect(prompt).toContain('- コーヒーが好き');
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

  it('retrievedMemories が渡されると system prompt に記憶セクションが注入される', () => {
    const memories = [makeRetrievedMemory('コーヒーが好き', 'B')];
    const messages = buildChatMessages(hiyori, new Date(), [], 'おはよう', memories);
    expect(messages[0].content).toContain('あなたが覚えていること');
    expect(messages[0].content).toContain('- コーヒーが好き');
  });

  it('retrievedMemories が空の場合は記憶セクションなし', () => {
    const messages = buildChatMessages(hiyori, new Date(), [], 'こんにちは', []);
    expect(messages[0].content).not.toContain('あなたが覚えていること');
  });

  it('summaryText が渡されると system prompt に圧縮要約セクションが注入される', () => {
    const messages = buildChatMessages(hiyori, new Date(), [], 'hi', [], 'コーヒーとケーキが好き');
    expect(messages[0].content).toContain('あなたがこれまでに知ったこと');
    expect(messages[0].content).toContain('コーヒーとケーキが好き');
  });

  it('summaryText が空文字の場合は圧縮要約セクションを挿入しない', () => {
    const messages = buildChatMessages(hiyori, new Date(), [], 'hi', [], '');
    expect(messages[0].content).not.toContain('あなたがこれまでに知ったこと');
  });

  it('summaryText と retrievedMemories の両方がある場合、要約が先に来る', () => {
    const memories = [makeRetrievedMemory('ケーキが好き', 'B')];
    const messages = buildChatMessages(hiyori, new Date(), [], 'hi', memories, '長期要約テキスト');
    const content = messages[0].content;
    const summaryIdx = content.indexOf('あなたがこれまでに知ったこと');
    const memoriesIdx = content.indexOf('あなたが覚えていること');
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(memoriesIdx).toBeGreaterThan(-1);
    expect(summaryIdx).toBeLessThan(memoriesIdx);
  });
});
