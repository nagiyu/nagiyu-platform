import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryKnowledgeRepository } from '../../../src/repositories/in-memory-knowledge.repository.js';
import { InMemoryNoteRepository } from '../../../src/repositories/in-memory-note.repository.js';
import { generateNotesForUser } from '../../../src/usecases/generate-note.usecase.js';

const longSummary = 'コーヒーには覚醒効果があり、適量なら健康にも良いとされています。'.repeat(3);

describe('generateNotesForUser', () => {
  let store: InMemorySingleTableStore;
  let knowledgeRepo: InMemoryKnowledgeRepository;
  let noteRepo: InMemoryNoteRepository;
  let ulidSeq: number;
  const ulidFactory = () => `note-${(ulidSeq++).toString().padStart(3, '0')}`;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    knowledgeRepo = new InMemoryKnowledgeRepository(store, () => 1000);
    noteRepo = new InMemoryNoteRepository(store, () => 2000);
    ulidSeq = 1;
  });

  const putKnowledge = (overrides: Record<string, unknown> = {}) =>
    knowledgeRepo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      KnowledgeID: 'know-001',
      Topic: 'コーヒーの効能',
      Summary: longSummary,
      SourceUrls: ['https://example.com'],
      RawComment: '面白いよね！',
      RelatedCategory: 'コーヒー',
      ...overrides,
    });

  it('高品質な KNOWLEDGE をノート化する', async () => {
    await putKnowledge();
    const result = await generateNotesForUser('u1', 'hiyori', {
      knowledgeRepo,
      noteRepo,
      ulidFactory,
    });
    expect(result.generatedCount).toBe(1);

    const notes = await noteRepo.list('u1', 'hiyori');
    expect(notes).toHaveLength(1);
    expect(notes[0].Title).toBe('コーヒーの効能');
    expect(notes[0].Body).toContain('面白いよね！');
    expect(notes[0].RelatedKnowledgeIds).toEqual(['know-001']);
    expect(notes[0].RelatedCategory).toBe('コーヒー');
  });

  it('Summary が短い KNOWLEDGE はノート化しない', async () => {
    await putKnowledge({ KnowledgeID: 'know-001', Summary: '短い要約。' });
    const result = await generateNotesForUser('u1', 'hiyori', {
      knowledgeRepo,
      noteRepo,
      ulidFactory,
    });
    expect(result.generatedCount).toBe(0);
  });

  it('既にノート化済みの KNOWLEDGE は重複生成しない', async () => {
    await putKnowledge({ KnowledgeID: 'know-001' });
    await noteRepo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      NoteID: 'existing',
      Title: '既存',
      Body: '既存本文',
      RelatedKnowledgeIds: ['know-001'],
      RelatedCategory: 'コーヒー',
    });

    const result = await generateNotesForUser('u1', 'hiyori', {
      knowledgeRepo,
      noteRepo,
      ulidFactory,
    });
    expect(result.generatedCount).toBe(0);
  });

  it('maxPerRun を超えてノートを生成しない', async () => {
    for (let i = 0; i < 5; i++) {
      await putKnowledge({ KnowledgeID: `know-00${i}` });
    }
    const result = await generateNotesForUser('u1', 'hiyori', {
      knowledgeRepo,
      noteRepo,
      ulidFactory,
      maxPerRun: 2,
    });
    expect(result.generatedCount).toBe(2);
  });

  it('KNOWLEDGE が無い場合は 0 件', async () => {
    const result = await generateNotesForUser('u1', 'hiyori', {
      knowledgeRepo,
      noteRepo,
      ulidFactory,
    });
    expect(result.generatedCount).toBe(0);
  });

  it('保存失敗時はスキップして件数に数えない', async () => {
    await putKnowledge({ KnowledgeID: 'know-001' });
    jest.spyOn(noteRepo, 'put').mockRejectedValueOnce(new Error('boom'));
    const result = await generateNotesForUser('u1', 'hiyori', {
      knowledgeRepo,
      noteRepo,
      ulidFactory,
    });
    expect(result.generatedCount).toBe(0);
  });
});
