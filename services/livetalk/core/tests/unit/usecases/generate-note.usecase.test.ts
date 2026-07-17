import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import { InMemoryNoteRepository } from '../../../src/repositories/in-memory-note.repository.js';
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
  let ulidSeq: number;
  const ulidFactory = () => `note-${(ulidSeq++).toString().padStart(3, '0')}`;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    tick = fixedNow;
    const nowMs = () => tick;
    topicRepo = new InMemoryTopicRepository(store, () => `topic-${tick++}`, nowMs);
    noteRepo = new InMemoryNoteRepository(store, nowMs);
    ulidSeq = 1;
  });

  const putTopic = async (overrides: Record<string, unknown> = {}) =>
    topicRepo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-001',
      Subject: 'コーヒーの効能',
      CanonicalSummary: 'ユーザーはコーヒーが好き',
      Category: '飲み物',
      Care: 3,
      Embedding: [1, 0],
      ...overrides,
    });

  const putWebFact = async (topicId: string, overrides: Record<string, unknown> = {}) =>
    topicRepo.putWebFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: topicId,
      Text: 'コーヒーには覚醒作用がある',
      SourceUrls: ['https://example.com'],
      Volatility: 'stable',
      ObservedAt: fixedNow,
      ...overrides,
    });

  const putSelfFact = async (topicId: string, overrides: Record<string, unknown> = {}) =>
    topicRepo.putSelfFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: topicId,
      Text: 'ユーザーはコーヒーが好き',
      Provenance: '「コーヒー好きなんだ」という発話より',
      ...overrides,
    });

  it('care 閾値以上・WEB あり・skip=false ならノートを生成する', async () => {
    await putTopic({ Care: 3 });
    await putWebFact('topic-001');
    await putSelfFact('topic-001');
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(1);
    const notes = await noteRepo.list('u1', 'hiyori');
    expect(notes).toHaveLength(1);
    expect(notes[0].TopicID).toBe('topic-001');
    expect(notes[0].Subject).toBe('コーヒーの効能');
    expect(notes[0].Headline).toBe(makeLetter().headline);
    expect(notes[0].Reaction).toBeUndefined();
  });

  it('care が閾値未満の Topic は生成しない', async () => {
    await putTopic({ Care: 2 });
    await putWebFact('topic-001');
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
      careThreshold: 3,
    });

    expect(result.generatedCount).toBe(0);
    expect(llmClient.chatStructuredCalls).toBe(0);
  });

  it('既にノート化済みの Topic は重複生成しない（1 Topic 1 ノート）', async () => {
    await putTopic({ Care: 3 });
    await putWebFact('topic-001');
    await noteRepo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      NoteID: 'existing-note',
      TopicID: 'topic-001',
      Subject: '既存',
      Headline: '既存の手紙',
    });
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(0);
    expect(llmClient.chatStructuredCalls).toBe(0);
  });

  it('WEB fact が 0 件の Topic はスキップする（贈る中身が無い）', async () => {
    await putTopic({ Care: 3 });
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(0);
    expect(llmClient.chatStructuredCalls).toBe(0);
  });

  it('LLM が skip=true を返した場合は生成しない', async () => {
    await putTopic({ Care: 3 });
    await putWebFact('topic-001');
    const llmClient = makeLLMClient([makeLetter({ skip: true })]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(0);
    const notes = await noteRepo.list('u1', 'hiyori');
    expect(notes).toHaveLength(0);
  });

  it('usedSelfHook=false（自発トーン）でも headline があればノートを生成する', async () => {
    await putTopic({ Care: 3 });
    await putWebFact('topic-001');
    // SELF fact なし（センシティブ等で使えない想定）でも WEB があれば自発トーンで贈る
    const llmClient = makeLLMClient([makeLetter({ usedSelfHook: false })]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(1);
  });

  it('maxPerRun を超えてノートを生成しない', async () => {
    for (let i = 0; i < 5; i++) {
      await putTopic({ TopicID: `topic-00${i}`, Care: 3 });
      await putWebFact(`topic-00${i}`);
    }
    const llmClient = makeLLMClient(() => makeLetter());

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
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
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });
    expect(result.generatedCount).toBe(0);
  });

  it('1 件の生成が失敗してもスキップして継続する（fail-warn）', async () => {
    await putTopic({ TopicID: 'topic-001', Care: 3 });
    await putWebFact('topic-001');
    await putTopic({ TopicID: 'topic-002', Care: 3 });
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
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    // care 降順の順序次第でどちらかは失敗するが、もう一方は成功する
    expect(result.generatedCount).toBe(1);
    expect(callCount).toBe(2);
  });

  it('noteRepo.put が失敗してもスキップして件数に数えない', async () => {
    await putTopic({ Care: 3 });
    await putWebFact('topic-001');
    jest.spyOn(noteRepo, 'put').mockRejectedValueOnce(new Error('boom'));
    const llmClient = makeLLMClient([makeLetter()]);

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
    });

    expect(result.generatedCount).toBe(0);
  });

  it('candidateLimit で care 降順スキャン件数を絞れる', async () => {
    for (let i = 0; i < 3; i++) {
      await putTopic({ TopicID: `topic-00${i}`, Care: 3 });
      await putWebFact(`topic-00${i}`);
    }
    const llmClient = makeLLMClient(() => makeLetter());

    const result = await generateNotesForUser('u1', 'hiyori', {
      topicRepo,
      noteRepo,
      llmClient,
      characterName: '桃瀬ひより',
      ulidFactory,
      candidateLimit: 1,
      maxPerRun: 10,
    });

    expect(result.generatedCount).toBe(1);
  });
});
