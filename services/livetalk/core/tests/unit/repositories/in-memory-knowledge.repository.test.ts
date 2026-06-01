import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryKnowledgeRepository } from '../../../src/repositories/in-memory-knowledge.repository.js';

describe('InMemoryKnowledgeRepository', () => {
  const baseNow = 1_700_000_000_000;
  let now = baseNow;
  let store: InMemorySingleTableStore;
  let repo: InMemoryKnowledgeRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryKnowledgeRepository(store, () => now);
  });

  const makeInput = (
    overrides: Partial<{
      UserID: string;
      CharacterID: string;
      KnowledgeID: string;
      Topic: string;
      Summary: string;
      SourceUrls: string[];
      RawComment: string;
      RelatedCategory: string;
    }> = {}
  ) => ({
    UserID: 'u1',
    CharacterID: 'hiyori',
    KnowledgeID: 'ulid-001',
    Topic: 'コーヒーの効能',
    Summary: 'コーヒーには覚醒効果があります。'.repeat(5),
    SourceUrls: ['https://example.com'],
    RawComment: '面白い！',
    RelatedCategory: 'コーヒー',
    ...overrides,
  });

  it('put で新規作成できる', async () => {
    const item = await repo.put(makeInput());
    expect(item.UserID).toBe('u1');
    expect(item.KnowledgeID).toBe('ulid-001');
    expect(item.CreatedAt).toBe(baseNow);
  });

  it('list でキャラ単位の全件を返す（CreatedAt 降順）', async () => {
    await repo.put(makeInput({ KnowledgeID: 'ulid-001' }));
    now += 1000;
    await repo.put(makeInput({ KnowledgeID: 'ulid-002' }));
    await repo.put(makeInput({ UserID: 'u2', KnowledgeID: 'ulid-003' }));

    const list = await repo.list('u1', 'hiyori');
    expect(list).toHaveLength(2);
    expect(list[0].KnowledgeID).toBe('ulid-002');
    expect(list[1].KnowledgeID).toBe('ulid-001');
  });

  it('list は limit を超えない', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.put(makeInput({ KnowledgeID: `ulid-00${i}` }));
      now += 100;
    }
    const list = await repo.list('u1', 'hiyori', 3);
    expect(list).toHaveLength(3);
  });

  it('getLatest は最新 1 件を返す', async () => {
    await repo.put(makeInput({ KnowledgeID: 'ulid-001' }));
    now += 1000;
    await repo.put(makeInput({ KnowledgeID: 'ulid-002' }));

    const latest = await repo.getLatest('u1', 'hiyori');
    expect(latest?.KnowledgeID).toBe('ulid-002');
  });

  it('getLatest は件数ゼロで null を返す', async () => {
    expect(await repo.getLatest('u1', 'hiyori')).toBeNull();
  });

  it('list は未登録ユーザーに対して空配列を返す', async () => {
    expect(await repo.list('unknown', 'hiyori')).toHaveLength(0);
  });
});
