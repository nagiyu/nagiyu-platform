import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryMessageRepository } from '../../../src/repositories/in-memory-message.repository.js';
import { MESSAGE_TTL_SECONDS } from '../../../src/constants.js';
import type { TokenCounter } from '../../../src/lib/token-counter.js';

/**
 * 各文字列を「1 トークン = 1 文字 + メッセージあたり 0」として扱う固定カウンタ。
 * 確定的に件数制御できるようにするためのテスト用 fake。
 */
const fixedCounter: TokenCounter = {
  countTokens: (t) => t.length,
  countTokensForMessage: (t) => t.length,
};

describe('InMemoryMessageRepository', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryMessageRepository;
  const baseNow = 1_700_000_000_000;
  let currentTime = baseNow;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    currentTime = baseNow;
    // 各 create で 1ms ずつ時刻を進めて ULID の単調性を保つ
    const ulidFactory = (seedTime?: number) => {
      const t = seedTime ?? currentTime;
      // ULID 形式（26 文字）を簡易再現：時刻を昇順比較できればよい
      return `ULID-${String(t).padStart(20, '0')}`;
    };
    repo = new InMemoryMessageRepository(store, ulidFactory, () => currentTime);
  });

  const createMessage = async (role: 'user' | 'assistant', text: string) => {
    currentTime += 1;
    return repo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: role,
      Text: text,
    });
  };

  it('create はメッセージを保存し ULID と CreatedAt を付与する', async () => {
    const msg = await createMessage('user', 'hello');
    expect(msg.MessageID).toMatch(/^ULID-/);
    expect(msg.CreatedAt).toBe(currentTime);
    expect(msg.Role).toBe('user');
    expect(msg.Text).toBe('hello');
  });

  it('create は TTL を 90 日後の Unix 秒として書き込む', async () => {
    await createMessage('user', 'hello');
    const items = Array.from(
      (store as unknown as { store: Map<string, Record<string, unknown>> }).store.values()
    );
    expect(items).toHaveLength(1);
    const ttl = items[0].TTL as number;
    const expected = Math.floor(currentTime / 1000) + MESSAGE_TTL_SECONDS;
    expect(ttl).toBe(expected);
  });

  it('getById で保存した内容を取得できる', async () => {
    const saved = await createMessage('assistant', 'こんにちは');
    const found = await repo.getById({
      userId: 'u1',
      characterId: 'hiyori',
      messageId: saved.MessageID,
    });
    expect(found).not.toBeNull();
    expect(found?.Text).toBe('こんにちは');
  });

  it('存在しない MessageID なら null', async () => {
    const found = await repo.getById({
      userId: 'u1',
      characterId: 'hiyori',
      messageId: 'missing',
    });
    expect(found).toBeNull();
  });

  describe('getRecentByTokenBudget', () => {
    it('保存ゼロなら空配列を返す', async () => {
      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
        tokenLimit: 100,
      });
      expect(result).toEqual({ messages: [], totalTokens: 0, truncated: false });
    });

    it('上限以下なら全件を時系列昇順で返す', async () => {
      const a = await createMessage('user', 'aaaa');
      const b = await createMessage('assistant', 'bb');
      const c = await createMessage('user', 'cc');

      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
        tokenLimit: 100,
      });

      expect(result.messages.map((m) => m.MessageID)).toEqual([
        a.MessageID,
        b.MessageID,
        c.MessageID,
      ]);
      expect(result.totalTokens).toBe(4 + 2 + 2);
      expect(result.truncated).toBe(false);
    });

    it('上限超過時は古いメッセージから打ち切られ truncated=true になる', async () => {
      const a = await createMessage('user', 'aaaa'); // 4
      await createMessage('assistant', 'bbb'); // 3
      const c = await createMessage('user', 'cc'); // 2
      const d = await createMessage('assistant', 'd'); // 1

      // 上限 5：新しい順に d(1) + c(2) で 3、次に b(3) を入れると 6 で超過 → b は含めない
      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
        tokenLimit: 5,
      });

      expect(result.messages.map((m) => m.MessageID)).toEqual([c.MessageID, d.MessageID]);
      expect(result.totalTokens).toBe(3);
      expect(result.truncated).toBe(true);
      // a は明示的に含まれない
      expect(result.messages.find((m) => m.MessageID === a.MessageID)).toBeUndefined();
    });

    it('上限が極端に小さくても最初の 1 件は必ず含める（コンテキスト皆無回避）', async () => {
      await createMessage('user', 'aaaaaaaaaa'); // 10
      await createMessage('assistant', 'bb');

      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
        tokenLimit: 1, // どれを入れても超過する
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].Text).toBe('bb');
      expect(result.truncated).toBe(true);
    });

    it('別キャラのメッセージは混入しない', async () => {
      await createMessage('user', 'hi');
      // hiyori 以外を 1 件挿入
      currentTime += 1;
      await repo.create({
        UserID: 'u1',
        CharacterID: 'other',
        Role: 'user',
        Text: 'other-char',
      });

      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].Text).toBe('hi');
    });

    it('別ユーザーのメッセージは混入しない', async () => {
      await createMessage('user', 'mine');
      currentTime += 1;
      await repo.create({
        UserID: 'u2',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: 'other-user',
      });

      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
      });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].Text).toBe('mine');
    });

    it('hardLimit 以上のメッセージがあると truncated=true で打ち切る', async () => {
      for (let i = 0; i < 10; i++) {
        await createMessage('user', String(i));
      }
      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
        tokenLimit: 1000,
        hardLimit: 3,
      });
      expect(result.messages).toHaveLength(3);
      expect(result.truncated).toBe(true);
    });
  });
});
