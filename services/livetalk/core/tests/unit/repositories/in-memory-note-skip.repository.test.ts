import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryNoteRepository } from '../../../src/repositories/in-memory-note.repository.js';
import { InMemoryNoteSkipRepository } from '../../../src/repositories/in-memory-note-skip.repository.js';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';

describe('InMemoryNoteSkipRepository', () => {
  const baseNow = 1_700_000_000_000;
  let now = baseNow;
  let store: InMemorySingleTableStore;
  let repo: InMemoryNoteSkipRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryNoteSkipRepository(store, () => now);
  });

  it('put で判断時刻を保存し、listAll で読める', async () => {
    const saved = await repo.put({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 't1',
      decidedAt: baseNow - 10,
    });

    expect(saved.decidedAt).toBe(baseNow - 10);
    expect(saved.updatedAt).toBe(baseNow);
    expect(await repo.listAll('u1', 'hiyori')).toEqual([saved]);
  });

  it('同じ Topic への put は上書きする', async () => {
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 't1', decidedAt: 1 });
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 't1', decidedAt: 2 });

    const list = await repo.listAll('u1', 'hiyori');
    expect(list).toHaveLength(1);
    expect(list[0].decidedAt).toBe(2);
  });

  it('listAll は他のユーザー・他のキャラの記録を返さない', async () => {
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 't1', decidedAt: 1 });
    await repo.put({ userId: 'u2', characterId: 'hiyori', topicId: 't1', decidedAt: 1 });
    await repo.put({ userId: 'u1', characterId: 'ageha', topicId: 't1', decidedAt: 1 });

    expect(await repo.listAll('u1', 'hiyori')).toHaveLength(1);
  });

  it('delete で消せる。無い記録の delete も成功する', async () => {
    const key = { userId: 'u1', characterId: 'hiyori', topicId: 't1' };
    await repo.put({ ...key, decidedAt: 1 });

    await repo.delete(key);
    await repo.delete(key);

    expect(await repo.listAll('u1', 'hiyori')).toEqual([]);
  });

  it('Topic の束 (getTopicBundle) とノート一覧には混ざらない', async () => {
    const topicRepo = new InMemoryTopicRepository(
      store,
      () => 'id',
      () => now
    );
    const noteRepo = new InMemoryNoteRepository(store, () => now);
    await repo.put({ userId: 'u1', characterId: 'hiyori', topicId: 't1', decidedAt: 1 });

    const bundle = await topicRepo.getTopicBundle({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 't1',
    });
    expect(bundle).toEqual({ topic: null, selfFacts: [], webFacts: [] });
    expect(await noteRepo.listAll('u1', 'hiyori')).toEqual([]);
  });
});
