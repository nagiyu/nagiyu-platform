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
        Trigger: 'input_keyword',
        DetectedPattern: '[自殺念慮] 死にたい',
        InputText: '死にたい',
        ResponseText: 'ねえ、今すごく心配しちゃった…',
      });
      expect(entity.UserID).toBe('u1');
      expect(entity.EventID).toBe('FIXED_ULID');
      expect(entity.Trigger).toBe('input_keyword');
      expect(entity.CreatedAt).toBe(fixedNow);
      expect(entity.UpdatedAt).toBe(fixedNow);
    });

    it('EventID を明示指定できる', async () => {
      const { repo } = makeRepo();
      const entity = await repo.create({
        UserID: 'u1',
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
        Trigger: 'input_keyword',
        DetectedPattern: 'test',
        InputText: 'input',
        ResponseText: 'response',
      });
      const found = await repo.getById({ userId: 'u1', eventId: 'FIXED_ULID' });
      expect(found).not.toBeNull();
      expect(found?.EventID).toBe('FIXED_ULID');
    });

    it('存在しないイベントは null を返す', async () => {
      const { repo } = makeRepo();
      const found = await repo.getById({ userId: 'u1', eventId: 'nonexistent' });
      expect(found).toBeNull();
    });
  });
});
