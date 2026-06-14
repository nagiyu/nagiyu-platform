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
        UserID: 'u1',
        CharacterID: 'hiyori',
        Trigger: 'input_keyword',
        DetectedPattern: '[自殺念慮] 死にたい',
        InputText: '死にたい',
        ResponseText: 'ねえ、今すごく心配しちゃった…',
      });
      expect(entity.UserID).toBe('u1');
      expect(entity.CharacterID).toBe('hiyori');
      expect(entity.EventID).toBe('FIXED_ULID');
      expect(entity.Trigger).toBe('input_keyword');
      expect(entity.CreatedAt).toBe(fixedNow);
      expect(entity.UpdatedAt).toBe(fixedNow);
    });

    it('EventID を明示指定できる', async () => {
      const { repo } = makeRepo();
      const entity = await repo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Trigger: 'output_moderation',
        DetectedPattern: 'Moderation flagged: self-harm',
        InputText: 'test',
        ResponseText: 'response',
        EventID: 'custom-id',
        ModerationCategories: '{"self-harm": true}',
      });
      expect(entity.EventID).toBe('custom-id');
      expect(entity.ModerationCategories).toBe('{"self-harm": true}');
    });
  });

  describe('getById()', () => {
    it('存在するイベントを取得できる', async () => {
      const { repo } = makeRepo();
      await repo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Trigger: 'input_keyword',
        DetectedPattern: 'test',
        InputText: 'input',
        ResponseText: 'response',
      });
      const found = await repo.getById({ userId: 'u1', eventId: 'FIXED_ULID' });
      expect(found).not.toBeNull();
      expect(found?.EventID).toBe('FIXED_ULID');
      expect(found?.CharacterID).toBe('hiyori');
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
        UserID: 'u1',
        CharacterID: 'hiyori',
        Trigger: 'input_keyword',
        DetectedPattern: 'pattern1',
        InputText: 'input1',
        ResponseText: 'response1',
      });
      await repo.create({
        UserID: 'u2',
        CharacterID: 'hiyori',
        Trigger: 'output_moderation',
        DetectedPattern: 'pattern2',
        InputText: 'input2',
        ResponseText: 'response2',
      });
      await repo.create({
        UserID: 'u3',
        CharacterID: 'ageha',
        Trigger: 'input_keyword',
        DetectedPattern: 'pattern3',
        InputText: 'input3',
        ResponseText: 'response3',
      });

      const result = await repo.listRecent(10);
      expect(result).toHaveLength(3);
      // ULID_C > ULID_B > ULID_A の降順
      expect(result[0].EventID).toBe('ULIDC');
      expect(result[1].EventID).toBe('ULIDB');
      expect(result[2].EventID).toBe('ULIDA');
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
          UserID: `u${i}`,
          CharacterID: 'hiyori',
          Trigger: 'input_keyword',
          DetectedPattern: `pattern${i}`,
          InputText: `input${i}`,
          ResponseText: `response${i}`,
        });
      }

      const result = await repo.listRecent(3);
      expect(result).toHaveLength(3);
    });

    it('CharacterID がサマリに含まれる', async () => {
      const { repo } = makeRepo();
      await repo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Trigger: 'input_keyword',
        DetectedPattern: 'test',
        InputText: 'input',
        ResponseText: 'response',
      });

      const result = await repo.listRecent(10);
      expect(result).toHaveLength(1);
      expect(result[0].CharacterID).toBe('hiyori');
    });

    it('PII（InputText/ResponseText）はサマリに含まれない', async () => {
      const { repo } = makeRepo();
      await repo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Trigger: 'input_keyword',
        DetectedPattern: 'test',
        InputText: 'これは PII データ',
        ResponseText: 'これも PII データ',
      });

      const result = await repo.listRecent(10);
      expect(result).toHaveLength(1);
      expect((result[0] as unknown as Record<string, unknown>).InputText).toBeUndefined();
      expect((result[0] as unknown as Record<string, unknown>).ResponseText).toBeUndefined();
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
          UserID: `u${i}`,
          CharacterID: 'hiyori',
          Trigger: 'input_keyword',
          DetectedPattern: `pattern${i}`,
          InputText: `input${i}`,
          ResponseText: `response${i}`,
        });
      }

      const result = await repo.listRecent(5);
      expect(result).toHaveLength(5);
      // 最後に作成した ULID0149 が先頭に来る（古い側 100 件で切り詰めていたら欠落する）
      expect(result[0].EventID).toBe('ULID0149');
      expect(result[4].EventID).toBe('ULID0145');
    });
  });
});
