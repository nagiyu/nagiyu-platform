import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryNoteRepository } from '../../../src/repositories/in-memory-note.repository.js';

describe('InMemoryNoteRepository', () => {
  const baseNow = 1_700_000_000_000;
  let now = baseNow;
  let store: InMemorySingleTableStore;
  let repo: InMemoryNoteRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = baseNow;
    repo = new InMemoryNoteRepository(store, () => now);
  });

  const makeInput = (
    overrides: Partial<{
      UserID: string;
      CharacterID: string;
      NoteID: string;
      Title: string;
      Body: string;
      RelatedKnowledgeIds: string[];
      RelatedCategory: string;
    }> = {}
  ) => ({
    UserID: 'u1',
    CharacterID: 'hiyori',
    NoteID: 'note-001',
    Title: 'コーヒーの効能',
    Body: 'コーヒーには覚醒効果があります。\n\n面白いよね！',
    RelatedKnowledgeIds: ['know-001'],
    RelatedCategory: 'コーヒー',
    ...overrides,
  });

  it('put で新規作成できる', async () => {
    const item = await repo.put(makeInput());
    expect(item.NoteID).toBe('note-001');
    expect(item.CreatedAt).toBe(baseNow);
    expect(item.UpdatedAt).toBe(baseNow);
  });

  it('list でキャラ単位の全件を返す（CreatedAt 降順）', async () => {
    await repo.put(makeInput({ NoteID: 'note-001' }));
    now += 1000;
    await repo.put(makeInput({ NoteID: 'note-002' }));
    await repo.put(makeInput({ UserID: 'u2', NoteID: 'note-003' }));

    const list = await repo.list('u1', 'hiyori');
    expect(list).toHaveLength(2);
    expect(list[0].NoteID).toBe('note-002');
    expect(list[1].NoteID).toBe('note-001');
  });

  it('list は limit を超えない', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.put(makeInput({ NoteID: `note-00${i}` }));
      now += 100;
    }
    const list = await repo.list('u1', 'hiyori', 3);
    expect(list).toHaveLength(3);
  });

  it('get は単一ノートを返す', async () => {
    await repo.put(makeInput({ NoteID: 'note-001' }));
    const note = await repo.get({ userId: 'u1', characterId: 'hiyori', noteId: 'note-001' });
    expect(note?.Title).toBe('コーヒーの効能');
  });

  it('get は存在しないノートに対して null を返す', async () => {
    expect(await repo.get({ userId: 'u1', characterId: 'hiyori', noteId: 'missing' })).toBeNull();
  });

  it('listRecent は指定日数内のノートのみ返す', async () => {
    // 10 日前のノート
    now = baseNow - 10 * 24 * 60 * 60 * 1000;
    await repo.put(makeInput({ NoteID: 'old-note' }));
    // 直近のノート
    now = baseNow;
    await repo.put(makeInput({ NoteID: 'recent-note' }));

    const recent = await repo.listRecent('u1', 'hiyori', { days: 7 });
    expect(recent).toHaveLength(1);
    expect(recent[0].NoteID).toBe('recent-note');
  });

  it('listRecent は limit を尊重する', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.put(makeInput({ NoteID: `note-00${i}` }));
      now += 100;
    }
    const recent = await repo.listRecent('u1', 'hiyori', { days: 7, limit: 2 });
    expect(recent).toHaveLength(2);
  });

  it('list は未登録ユーザーに対して空配列を返す', async () => {
    expect(await repo.list('unknown', 'hiyori')).toHaveLength(0);
  });
});
