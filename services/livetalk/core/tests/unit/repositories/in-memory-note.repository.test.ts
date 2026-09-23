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
      TopicID: string;
      Subject: string;
      Headline: string;
    }> = {}
  ) => ({
    UserID: 'u1',
    CharacterID: 'hiyori',
    NoteID: 'note-001',
    TopicID: 'topic-001',
    Subject: 'コーヒーの効能',
    Headline: 'この前の話、気になって調べてみたよ。覚醒効果があるみたい！',
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
    expect(note?.Subject).toBe('コーヒーの効能');
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

  describe('listAll', () => {
    it('全件を CreatedAt 降順で返す（limit による打ち切りなし）', async () => {
      // 150 件登録
      for (let i = 0; i < 150; i++) {
        await repo.put(makeInput({ NoteID: `note-${i}` }));
        now += 100;
      }
      const all = await repo.listAll('u1', 'hiyori');
      // list(100) とは異なり全 150 件返す
      expect(all).toHaveLength(150);
    });

    it('CreatedAt 降順で返す', async () => {
      await repo.put(makeInput({ NoteID: 'note-old' }));
      now += 1000;
      await repo.put(makeInput({ NoteID: 'note-new' }));

      const all = await repo.listAll('u1', 'hiyori');
      expect(all).toHaveLength(2);
      expect(all[0].NoteID).toBe('note-new');
      expect(all[1].NoteID).toBe('note-old');
    });

    it('別ユーザーのノートは含まない', async () => {
      await repo.put(makeInput({ UserID: 'u1', NoteID: 'note-u1' }));
      await repo.put(makeInput({ UserID: 'u2', NoteID: 'note-u2' }));

      const all = await repo.listAll('u1', 'hiyori');
      expect(all).toHaveLength(1);
      expect(all[0].NoteID).toBe('note-u1');
    });

    it('ノートが 0 件の場合は空配列を返す', async () => {
      expect(await repo.listAll('u1', 'hiyori')).toHaveLength(0);
    });
  });

  describe('updateReaction', () => {
    it('Reaction を設定し UpdatedAt を bump する', async () => {
      await repo.put(makeInput({ NoteID: 'note-001' }));
      now += 1000;
      await repo.updateReaction(
        { userId: 'u1', characterId: 'hiyori', noteId: 'note-001' },
        'すごく良かった！'
      );

      const note = await repo.get({ userId: 'u1', characterId: 'hiyori', noteId: 'note-001' });
      expect(note?.Reaction).toBe('すごく良かった！');
      expect(note?.UpdatedAt).toBe(baseNow + 1000);
      // CreatedAt は不変
      expect(note?.CreatedAt).toBe(baseNow);
    });

    it('対象が存在しない場合は no-op', async () => {
      await expect(
        repo.updateReaction({ userId: 'u1', characterId: 'hiyori', noteId: 'missing' }, '感想')
      ).resolves.toBeUndefined();
    });
  });
});
