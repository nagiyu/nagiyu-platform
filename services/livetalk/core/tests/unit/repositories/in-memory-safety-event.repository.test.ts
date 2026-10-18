import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemorySafetyEventRepository } from '../../../src/repositories/in-memory-safety-event.repository.js';

function makeStore() {
  return new InMemorySingleTableStore();
}

function makeRepo(store = makeStore()) {
  const fixedNow = 1_700_000_000_000;
  return {
    repo: new InMemorySafetyEventRepository(
      store,
      () => 'FIXED_ULID',
      () => fixedNow
    ),
    store,
    fixedNow,
  };
}

describe('InMemorySafetyEventRepository', () => {
  describe('create()', () => {
    it('SafetyEvent を作成して返す', async () => {
      const { repo, fixedNow } = makeRepo();
      const entity = await repo.create({
        userId: 'u1',
        characterId: 'hiyori',
        trigger: 'input_keyword',
        detectedPattern: '[自殺念慮] 死にたい',
        inputText: '死にたい',
        responseText: 'ねえ、今すごく心配しちゃった…',
      });
      expect(entity.userId).toBe('u1');
      expect(entity.characterId).toBe('hiyori');
      expect(entity.eventId).toBe('FIXED_ULID');
      expect(entity.trigger).toBe('input_keyword');
      expect(entity.createdAt).toBe(fixedNow);
      expect(entity.updatedAt).toBe(fixedNow);
    });

    it('eventId を明示指定できる', async () => {
      const { repo } = makeRepo();
      const entity = await repo.create({
        userId: 'u1',
        characterId: 'hiyori',
        trigger: 'output_moderation',
        detectedPattern: 'Moderation flagged: self-harm',
        inputText: 'test',
        responseText: 'response',
        eventId: 'custom-id',
        moderationCategories: '{"self-harm": true}',
      });
      expect(entity.eventId).toBe('custom-id');
      expect(entity.moderationCategories).toBe('{"self-harm": true}');
    });
  });

  describe('getById()', () => {
    it('存在するイベントを取得できる', async () => {
      const { repo } = makeRepo();
      await repo.create({
        userId: 'u1',
        characterId: 'hiyori',
        trigger: 'input_keyword',
        detectedPattern: 'test',
        inputText: 'input',
        responseText: 'response',
      });
      const found = await repo.getById({ userId: 'u1', eventId: 'FIXED_ULID' });
      expect(found).not.toBeNull();
      expect(found?.eventId).toBe('FIXED_ULID');
      expect(found?.characterId).toBe('hiyori');
    });

    it('存在しないイベントは null を返す', async () => {
      const { repo } = makeRepo();
      const found = await repo.getById({ userId: 'u1', eventId: 'nonexistent' });
      expect(found).toBeNull();
    });
  });

  describe('listRecent()', () => {
    it('複数件作成後、降順で返す', async () => {
      // ULID はソートのため異なる値を使用する（後から作ったものが lexicographically 後になる）
      const store = makeStore();
      const nowBase = 1_700_000_000_000;
      let callCount = 0;
      const ulidFactory = () => `ULID${String.fromCharCode(65 + callCount++)}`;
      const repo = new (
        await import('../../../src/repositories/in-memory-safety-event.repository.js')
      ).InMemorySafetyEventRepository(store, ulidFactory, () => nowBase);

      // 3 件作成（ULID_A, ULID_B, ULID_C の順）
      await repo.create({
        userId: 'u1',
        characterId: 'hiyori',
        trigger: 'input_keyword',
        detectedPattern: 'pattern1',
        inputText: 'input1',
        responseText: 'response1',
      });
      await repo.create({
        userId: 'u2',
        characterId: 'hiyori',
        trigger: 'output_moderation',
        detectedPattern: 'pattern2',
        inputText: 'input2',
        responseText: 'response2',
      });
      await repo.create({
        userId: 'u3',
        characterId: 'ageha',
        trigger: 'input_keyword',
        detectedPattern: 'pattern3',
        inputText: 'input3',
        responseText: 'response3',
      });

      const result = await repo.listRecent(10);
      expect(result).toHaveLength(3);
      // ULID_C > ULID_B > ULID_A の降順
      expect(result[0].eventId).toBe('ULIDC');
      expect(result[1].eventId).toBe('ULIDB');
      expect(result[2].eventId).toBe('ULIDA');
    });

    it('limit が効く', async () => {
      const store = makeStore();
      let callCount = 0;
      const ulidFactory = () => `ULID${String.fromCharCode(65 + callCount++)}`;
      const repo = new (
        await import('../../../src/repositories/in-memory-safety-event.repository.js')
      ).InMemorySafetyEventRepository(store, ulidFactory, () => 1_700_000_000_000);

      for (let i = 0; i < 5; i++) {
        await repo.create({
          userId: `u${i}`,
          characterId: 'hiyori',
          trigger: 'input_keyword',
          detectedPattern: `pattern${i}`,
          inputText: `input${i}`,
          responseText: `response${i}`,
        });
      }

      const result = await repo.listRecent(3);
      expect(result).toHaveLength(3);
    });

    it('characterId がサマリに含まれる', async () => {
      const { repo } = makeRepo();
      await repo.create({
        userId: 'u1',
        characterId: 'hiyori',
        trigger: 'input_keyword',
        detectedPattern: 'test',
        inputText: 'input',
        responseText: 'response',
      });

      const result = await repo.listRecent(10);
      expect(result).toHaveLength(1);
      expect(result[0].characterId).toBe('hiyori');
    });

    it('PII（InputText/ResponseText）はサマリに含まれない', async () => {
      const { repo } = makeRepo();
      await repo.create({
        userId: 'u1',
        characterId: 'hiyori',
        trigger: 'input_keyword',
        detectedPattern: 'test',
        inputText: 'これは PII データ',
        responseText: 'これも PII データ',
      });

      const result = await repo.listRecent(10);
      expect(result).toHaveLength(1);
      expect((result[0] as unknown as Record<string, unknown>).inputText).toBeUndefined();
      expect((result[0] as unknown as Record<string, unknown>).responseText).toBeUndefined();
    });

    it('0 件のとき空配列を返す', async () => {
      const { repo } = makeRepo();
      const result = await repo.listRecent(10);
      expect(result).toEqual([]);
    });

    it('100 件超でも最近の検出を取り落とさない（queryByAttribute の既定 limit=100 回帰）', async () => {
      // queryByAttribute は既定 limit=100 でページングするため、cursor ループで全件集約しないと
      // 「先頭 100 件（挿入順=古い側）」だけを降順ソートしてしまい、最近の検出が欠落する。
      const store = makeStore();
      let callCount = 0;
      // 連番をゼロ詰めし、後から作るほど lexicographically 大きい ULID にする
      const ulidFactory = () => `ULID${String(callCount++).padStart(4, '0')}`;
      const repo = new (
        await import('../../../src/repositories/in-memory-safety-event.repository.js')
      ).InMemorySafetyEventRepository(store, ulidFactory, () => 1_700_000_000_000);

      const total = 150;
      for (let i = 0; i < total; i++) {
        await repo.create({
          userId: `u${i}`,
          characterId: 'hiyori',
          trigger: 'input_keyword',
          detectedPattern: `pattern${i}`,
          inputText: `input${i}`,
          responseText: `response${i}`,
        });
      }

      const result = await repo.listRecent(5);
      expect(result).toHaveLength(5);
      // 最後に作成した ULID0149 が先頭に来る（古い側 100 件で切り詰めていたら欠落する）
      expect(result[0].eventId).toBe('ULID0149');
      expect(result[4].eventId).toBe('ULID0145');
    });
  });
});
