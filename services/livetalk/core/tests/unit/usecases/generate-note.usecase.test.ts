import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import { InMemoryNoteRepository } from '../../../src/repositories/in-memory-note.repository.js';
import { InMemoryNoteSkipRepository } from '../../../src/repositories/in-memory-note-skip.repository.js';
import { generateNotesForUser } from '../../../src/usecases/generate-note.usecase.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { NoteLetterRaw } from '../../../src/llm-client/schemas/note-letter.schema.js';

const fixedNow = 1_750_000_000_000;
let tick = fixedNow;

const makeLLMClient = (
  responses: NoteLetterRaw[] | ((callIndex: number) => NoteLetterRaw)
): ILLMClient & { chatStructuredCalls: number } => {
  let chatStructuredCalls = 0;
  return {
    async *chatStream() {
      yield '';
    },
    async chatComplete() {
      return '';
    },
    async chatStructured() {
      const index = chatStructuredCalls;
      chatStructuredCalls++;
      const value = Array.isArray(responses) ? responses[index] : responses(index);
      return value as unknown as never;
    },
    get chatStructuredCalls() {
      return chatStructuredCalls;
    },
  };
};

const makeLetter = (overrides: Partial<NoteLetterRaw> = {}): NoteLetterRaw => ({
  skip: false,
  usedSelfHook: true,
  headline: 'この前コーヒーの話をしてたよね、気になって調べてみたよ。覚醒効果があるみたい！',
  ...overrides,
});

describe('generateNotesForUser', () => {
  let store: InMemorySingleTableStore;
  let topicRepo: InMemoryTopicRepository;
  let noteRepo: InMemoryNoteRepository;
  let noteSkipRepo: InMemoryNoteSkipRepository;
  let ulidSeq: number;
  const ulidFactory = () => `note-${(ulidSeq++).toString().padStart(3, '0')}`;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    tick = fixedNow;
    const nowMs = () => tick;
    topicRepo = new InMemoryTopicRepository(store, () => `topic-${tick++}`, nowMs);
    noteRepo = new InMemoryNoteRepository(store, nowMs);
    noteSkipRepo = new InMemoryNoteSkipRepository(store, nowMs);
    ulidSeq = 1;
  });

  const putTopic = async (overrides: Record<string, unknown> = {}) =>
    topicRepo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-001',
      subject: 'コーヒーの効能',
      canonicalSummary: 'ユーザーはコーヒーが好き',
      category: '飲み物',
      care: 3,
      embedding: [1, 0],
      ...overrides,
    });

  const putWebFact = async (topicId: string, overrides: Record<string, unknown> = {}) =>
    topicRepo.putWebFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: topicId,
      text: 'コーヒーには覚醒作用がある',
      sourceUrls: ['https://example.com'],
      volatility: 'stable',
      observedAt: fixedNow,
      ...overrides,
    });

  const putSelfFact = async (topicId: string, overrides: Record<string, unknown> = {}) =>
    topicRepo.putSelfFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: topicId,
      text: 'ユーザーはコーヒーが好き',
      provenance: '「コーヒー好きなんだ」という発話より',
      ...overrides,
    });

  it('care 閾値以上・WEB あり・skip=false ならノートを生成する', async () => {
    await putTopic({ care: 3 });
    await putWebFact('topic-001');
    await putSelfFact('topic-001');
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(1);
    const notes = await noteRepo.list('u1', 'hiyori');
    expect(notes).toHaveLength(1);
    expect(notes[0].topicId).toBe('topic-001');
    expect(notes[0].subject).toBe('コーヒーの効能');
    expect(notes[0].headline).toBe(makeLetter().headline);
    expect(notes[0].reaction).toBeUndefined();
  });

  it('care が閾値未満の Topic は生成しない', async () => {
    await putTopic({ care: 2 });
    await putWebFact('topic-001');
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
      careThreshold: 3,
    });

    expect(result.generatedCount).toBe(0);
    expect(llmClient.chatStructuredCalls).toBe(0);
  });

  it('既にノート化済みの Topic は重複生成しない（1 Topic 1 ノート）', async () => {
    await putTopic({ care: 3 });
    await putWebFact('topic-001');
    await noteRepo.put({
      userId: 'u1',
      characterId: 'hiyori',
      noteId: 'existing-note',
      topicId: 'topic-001',
      subject: '既存',
      headline: '既存の手紙',
    });
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(0);
    expect(llmClient.chatStructuredCalls).toBe(0);
  });

  it('WEB fact が 0 件の Topic はスキップする（贈る中身が無い）', async () => {
    await putTopic({ care: 3 });
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(0);
    expect(llmClient.chatStructuredCalls).toBe(0);
  });

  it('LLM が skip=true を返した場合は生成しない', async () => {
    await putTopic({ care: 3 });
    await putWebFact('topic-001');
    const llmClient = makeLLMClient([makeLetter({ skip: true })]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(0);
    const notes = await noteRepo.list('u1', 'hiyori');
    expect(notes).toHaveLength(0);
  });

  it('usedSelfHook=false（自発トーン）でも headline があればノートを生成する', async () => {
    await putTopic({ care: 3 });
    await putWebFact('topic-001');
    // SELF fact なし（センシティブ等で使えない想定）でも WEB があれば自発トーンで贈る
    const llmClient = makeLLMClient([makeLetter({ usedSelfHook: false })]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(1);
  });

  it('maxPerRun を超えてノートを生成しない', async () => {
    for (let i = 0; i < 5; i++) {
      await putTopic({ topicId: `topic-00${i}`, care: 3 });
      await putWebFact(`topic-00${i}`);
    }
    const llmClient = makeLLMClient(() => makeLetter());

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
      maxPerRun: 2,
    });

    expect(result.generatedCount).toBe(2);
  });

  it('Topic が無い場合は 0 件', async () => {
    const llmClient = makeLLMClient([makeLetter()]);
    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });
    expect(result.generatedCount).toBe(0);
  });

  it('1 件の生成が失敗してもスキップして継続する（fail-warn）', async () => {
    await putTopic({ topicId: 'topic-001', care: 3 });
    await putWebFact('topic-001');
    await putTopic({ topicId: 'topic-002', care: 3 });
    await putWebFact('topic-002');

    let callCount = 0;
    const llmClient: ILLMClient = {
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async chatStructured() {
        callCount++;
        if (callCount === 1) throw new Error('LLM 失敗');
        return makeLetter() as unknown as never;
      },
    };

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    // care 降順の順序次第でどちらかは失敗するが、もう一方は成功する
    expect(result.generatedCount).toBe(1);
    expect(callCount).toBe(2);
  });

  it('noteRepo.put が失敗してもスキップして件数に数えない', async () => {
    await putTopic({ care: 3 });
    await putWebFact('topic-001');
    jest.spyOn(noteRepo, 'put').mockRejectedValueOnce(new Error('boom'));
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(0);
  });

  it('candidateLimit で care 降順スキャン件数を絞れる', async () => {
    for (let i = 0; i < 3; i++) {
      await putTopic({ topicId: `topic-00${i}`, care: 3 });
      await putWebFact(`topic-00${i}`);
    }
    const llmClient = makeLLMClient(() => makeLetter());

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      noteSkipRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
      candidateLimit: 1,
      maxPerRun: 10,
    });

    expect(result.generatedCount).toBe(1);
  });

  describe('「生成しない」判断の記憶', () => {
    const key = { userId: 'u1', characterId: 'hiyori', topicId: 'topic-001' };
    const run = (llmClient: ILLMClient, extra: Record<string, unknown> = {}) =>
      generateNotesForUser('u1', 'hiyori', {
        topicRepo,
        noteRepo,
        noteSkipRepo,
        llmClient,
        characterName: '桃瀬ひより',
        ulidFactory,
        now: () => tick,
        ...extra,
      });

    it('skip=true の判断を、中身を読む前の時刻で記録する', async () => {
      await putTopic({ care: 3 });
      await putWebFact('topic-001');
      tick = fixedNow + 1000;
      const judgedAt = tick;

      await run(makeLLMClient([makeLetter({ skip: true })]));

      const records = await noteSkipRepo.listAll('u1', 'hiyori');
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ topicId: 'topic-001', decidedAt: judgedAt });
    });

    it('記録があり、その後に WEB fact が増えていなければ LLM を呼ばない', async () => {
      await putTopic({ care: 3 });
      await putWebFact('topic-001');
      tick = fixedNow + 1000;
      await run(makeLLMClient([makeLetter({ skip: true })]));
      tick += 1000;
      const llmClient = makeLLMClient([makeLetter()]);

      const result = await run(llmClient);

      expect(llmClient.chatStructuredCalls).toBe(0);
      expect(result.generatedCount).toBe(0);
    });

    it('判断時刻と同時刻に作られた fact では評価し直さない（後に増えたものだけが対象）', async () => {
      await putTopic({ care: 3 });
      tick = fixedNow + 1000;
      const fact = await putWebFact('topic-001');
      await noteSkipRepo.put({ ...key, decidedAt: fact.createdAt });
      const llmClient = makeLLMClient([makeLetter()]);

      await run(llmClient);

      expect(llmClient.chatStructuredCalls).toBe(0);
    });

    it('記録後に WEB fact が増えたら評価し直し、ノートを作れば記録を消す', async () => {
      await putTopic({ care: 3 });
      await putWebFact('topic-001');
      await noteSkipRepo.put({ ...key, decidedAt: fixedNow + 10 });
      tick = fixedNow + 1000;
      await putWebFact('topic-001', { text: '新しい事実' });
      const llmClient = makeLLMClient([makeLetter()]);

      const result = await run(llmClient);

      expect(llmClient.chatStructuredCalls).toBe(1);
      expect(result.generatedCount).toBe(1);
      expect(await noteSkipRepo.listAll('u1', 'hiyori')).toEqual([]);
    });

    it('再評価でも skip=true なら判断時刻を上書きする', async () => {
      await putTopic({ care: 3 });
      await putWebFact('topic-001');
      await noteSkipRepo.put({ ...key, decidedAt: fixedNow + 10 });
      tick = fixedNow + 1000;
      await putWebFact('topic-001', { text: '新しい事実' });
      tick = fixedNow + 2000;

      await run(makeLLMClient([makeLetter({ skip: true })]));

      const records = await noteSkipRepo.listAll('u1', 'hiyori');
      expect(records).toHaveLength(1);
      expect(records[0].decidedAt).toBe(fixedNow + 2000);
    });

    it('記録の取得に失敗しても記録なしで評価を続ける', async () => {
      await putTopic({ care: 3 });
      await putWebFact('topic-001');
      jest.spyOn(noteSkipRepo, 'listAll').mockRejectedValueOnce(new Error('boom'));

      const result = await run(makeLLMClient([makeLetter()]));

      expect(result.generatedCount).toBe(1);
    });

    it('記録の保存に失敗しても次の候補の評価を続ける', async () => {
      await putTopic({ topicId: 'topic-001', care: 4 });
      await putWebFact('topic-001');
      await putTopic({ topicId: 'topic-002', care: 3 });
      await putWebFact('topic-002');
      jest.spyOn(noteSkipRepo, 'put').mockRejectedValueOnce(new Error('boom'));

      const result = await run(makeLLMClient([makeLetter({ skip: true }), makeLetter()]));

      expect(result.generatedCount).toBe(1);
      expect((await noteRepo.listAll('u1', 'hiyori'))[0].topicId).toBe('topic-002');
    });

    it('記録の削除に失敗しても、保存済みのノートは生成として数える', async () => {
      await putTopic({ care: 3 });
      await putWebFact('topic-001');
      await noteSkipRepo.put({ ...key, decidedAt: fixedNow - 1 });
      jest.spyOn(noteSkipRepo, 'delete').mockRejectedValueOnce(new Error('boom'));

      const result = await run(makeLLMClient([makeLetter()]));

      expect(result.generatedCount).toBe(1);
    });
  });
});
