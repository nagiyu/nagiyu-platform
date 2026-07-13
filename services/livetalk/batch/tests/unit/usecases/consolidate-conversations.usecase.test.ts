import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  InMemoryTopicRepository,
  InMemoryMessageRepository,
  InMemoryWebRawRepository,
  InMemoryConsolidationCursorRepository,
  InMemoryProfileRepository,
  InMemoryNoteRepository,
  type ILLMClient,
  type IEmbeddingClient,
} from '@nagiyu/livetalk-core';
import {
  consolidateAllConversations,
  type ConsolidateAllConversationsParams,
} from '../../../src/usecases/consolidate-conversations.usecase.js';

const fixedNow = 1_750_000_000_000;
let tick = fixedNow;

const makeTopicResult = () => ({
  targetTopicId: '',
  subject: 'コーヒー',
  category: '飲み物',
  canonicalSummary: 'ユーザーはコーヒーが好き',
  selfFacts: [],
  webFacts: [],
});

const makeNoteLetter = () => ({
  skip: true,
  usedSelfHook: false,
  headline: '',
});

/**
 * consolidate（topics）と generateNotesForUser（NoteLetterSchema）の両方が
 * `chatStructured` 経由で呼ばれるため、topics 配列の有無で応答を切り替える。
 * デフォルトはノート生成側を skip=true にして「集約バッチが LLM を計 2 回呼ぶこと」だけを
 * 素直に検証できるようにする（ノート生成の詳細挙動は generate-note.usecase.test.ts が担う）。
 */
const makeLLMClient = (): ILLMClient & { chatStructuredCalls: number } => {
  let chatStructuredCalls = 0;
  return {
    async *chatStream() {
      yield '';
    },
    async chatComplete() {
      return '';
    },
    async chatStructured(messages) {
      chatStructuredCalls++;
      const isConsolidate = messages.some((m) => m.content.includes('話題（Topic）ごとにまとめ'));
      if (isConsolidate) {
        return { topics: [makeTopicResult()] } as unknown as never;
      }
      return makeNoteLetter() as unknown as never;
    },
    async summarize() {
      return { mergedSummary: '要約', newMemoryCandidates: [] };
    },
    get chatStructuredCalls() {
      return chatStructuredCalls;
    },
  };
};

const makeEmbeddingClient = (): IEmbeddingClient => ({
  embed: async () => [1, 0],
});

const makeRepos = (sharedStore?: InMemorySingleTableStore) => {
  const store = sharedStore ?? new InMemorySingleTableStore();
  tick = fixedNow;
  const nowMs = () => tick;
  const ulidFactory = () => `ULID-${tick++}`;
  return {
    store,
    topicRepo: new InMemoryTopicRepository(store, ulidFactory, nowMs),
    messageRepo: new InMemoryMessageRepository(store, ulidFactory, nowMs),
    webRawRepo: new InMemoryWebRawRepository(store, ulidFactory, nowMs),
    cursorRepo: new InMemoryConsolidationCursorRepository(store, nowMs),
    profileRepo: new InMemoryProfileRepository(store, nowMs),
    noteRepo: new InMemoryNoteRepository(store, nowMs),
  };
};

/**
 * 指定した userIds を持つ InMemoryProfileRepository を作る。
 * 別ストアを使って profile だけを登録する。
 */
const makeProfileRepoWithUsers = async (userIds: string[]): Promise<InMemoryProfileRepository> => {
  const store = new InMemorySingleTableStore();
  const nowMs = () => fixedNow;
  const profileRepo = new InMemoryProfileRepository(store, nowMs);
  for (const id of userIds) {
    await profileRepo.upsert({ UserID: id });
  }
  return profileRepo;
};

const makeParams = (
  overrides: Partial<ConsolidateAllConversationsParams> = {}
): ConsolidateAllConversationsParams => {
  const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo, noteRepo } = makeRepos();
  return {
    profileRepo,
    topicRepo,
    messageRepo,
    webRawRepo,
    cursorRepo,
    noteRepo,
    llmClient: makeLLMClient(),
    embeddingClient: makeEmbeddingClient(),
    ...overrides,
  };
};

describe('consolidateAllConversations', () => {
  it('ユーザーが 0 件のとき LLM を呼ばない', async () => {
    const llmClient = makeLLMClient();
    const result = await consolidateAllConversations(makeParams({ llmClient }));
    expect(llmClient.chatStructuredCalls).toBe(0);
    expect(result.processedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
  });

  it('未集約データのないユーザーは処理をスキップする（LLM 呼び出しなし）', async () => {
    const llmClient = makeLLMClient();
    const profileRepo = await makeProfileRepoWithUsers(['u1', 'u2']);
    const result = await consolidateAllConversations(makeParams({ llmClient, profileRepo }));
    expect(llmClient.chatStructuredCalls).toBe(0);
    expect(result.processedUsers).toBe(0);
    expect(result.skippedUsers).toBe(2);
  });

  it('hiyori に未集約メッセージのあるユーザー分だけ LLM を呼ぶ', async () => {
    const llmClient = makeLLMClient();
    const store = new InMemorySingleTableStore();
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo, noteRepo } =
      makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hello' });
    await profileRepo.upsert({ UserID: 'u1' });
    await profileRepo.upsert({ UserID: 'u2' });

    const result = await consolidateAllConversations({
      profileRepo,
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      noteRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient(),
    });

    expect(llmClient.chatStructuredCalls).toBe(1);
    expect(result.processedUsers).toBe(1);
    expect(result.skippedUsers).toBe(1);
    expect(result.failedUsers).toBe(0);
  });

  it('1 ユーザーが失敗しても他のユーザーを継続処理する', async () => {
    let callCount = 0;
    const errorClient: ILLMClient = {
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async chatStructured() {
        callCount++;
        if (callCount === 1) throw new Error('LLM 失敗');
        return { topics: [makeTopicResult()] } as unknown as never;
      },
      async summarize() {
        return { mergedSummary: '要約', newMemoryCandidates: [] };
      },
    };

    const store = new InMemorySingleTableStore();
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo, noteRepo } =
      makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hi' });
    tick++;
    await messageRepo.create({ UserID: 'u2', CharacterID: 'hiyori', Role: 'user', Text: 'hi2' });
    await profileRepo.upsert({ UserID: 'u1' });
    await profileRepo.upsert({ UserID: 'u2' });

    const result = await consolidateAllConversations({
      profileRepo,
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      noteRepo,
      llmClient: errorClient,
      embeddingClient: makeEmbeddingClient(),
    });

    expect(result.failedUsers).toBe(1);
    expect(result.failedUserIds).toContain('u1');
    expect(result.processedUsers).toBe(1);
  });

  it('あるキャラクター処理がエラーでも他キャラは処理され、ユーザーは failed に計上される', async () => {
    let callCount = 0;
    const partialErrorClient: ILLMClient = {
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async chatStructured() {
        callCount++;
        // hiyori（1 回目）は成功、ageha（2 回目）は失敗
        if (callCount === 2) throw new Error('ageha LLM 失敗');
        return { topics: [makeTopicResult()] } as unknown as never;
      },
      async summarize() {
        return { mergedSummary: '要約', newMemoryCandidates: [] };
      },
    };

    const store = new InMemorySingleTableStore();
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo, noteRepo } =
      makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hi' });
    tick++;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'ageha', Role: 'user', Text: 'hi2' });
    await profileRepo.upsert({ UserID: 'u1' });

    const result = await consolidateAllConversations({
      profileRepo,
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      noteRepo,
      llmClient: partialErrorClient,
      embeddingClient: makeEmbeddingClient(),
    });

    expect(callCount).toBe(2);
    expect(result.failedUsers).toBe(1);
    expect(result.failedUserIds).toContain('u1');
    expect(result.processedUsers).toBe(0);
  });

  it('複数キャラ（hiyori と ageha）両方に未集約データがある場合 LLM が 2 回呼ばれる', async () => {
    const llmClient = makeLLMClient();
    const store = new InMemorySingleTableStore();
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo, noteRepo } =
      makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: 'hiyori msg',
    });
    tick++;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'ageha',
      Role: 'user',
      Text: 'ageha msg',
    });
    await profileRepo.upsert({ UserID: 'u1' });

    const result = await consolidateAllConversations({
      profileRepo,
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      noteRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient(),
    });

    expect(llmClient.chatStructuredCalls).toBe(2);
    expect(result.processedUsers).toBe(1);
    expect(result.failedUsers).toBe(0);
  });

  it('characterName が各キャラの displayName で渡されること（hiyori は 桃瀬ひより）', async () => {
    const capturedNames: string[] = [];
    const spyClient: ILLMClient = {
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async chatStructured(messages) {
        const systemMessage = messages.find((m) => m.role === 'system')?.content ?? '';
        capturedNames.push(systemMessage);
        return { topics: [makeTopicResult()] } as unknown as never;
      },
      async summarize() {
        return { mergedSummary: '要約', newMemoryCandidates: [] };
      },
    };

    const store = new InMemorySingleTableStore();
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo, noteRepo } =
      makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hello' });
    tick++;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'ageha', Role: 'user', Text: 'hey' });
    await profileRepo.upsert({ UserID: 'u1' });

    await consolidateAllConversations({
      profileRepo,
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      noteRepo,
      llmClient: spyClient,
      embeddingClient: makeEmbeddingClient(),
    });

    expect(capturedNames.some((n) => n.includes('桃瀬ひより'))).toBe(true);
    expect(capturedNames.some((n) => !n.includes('桃瀬ひより'))).toBe(true);
  });

  it('未集約データのあるユーザーは processedUsers、ないユーザーは skippedUsers に計上される（混在ケース）', async () => {
    const llmClient = makeLLMClient();
    const store = new InMemorySingleTableStore();
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo, noteRepo } =
      makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hello' });
    await profileRepo.upsert({ UserID: 'u1' });
    await profileRepo.upsert({ UserID: 'u2' });

    const result = await consolidateAllConversations({
      profileRepo,
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      noteRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient(),
    });

    expect(result.processedUsers).toBe(1);
    expect(result.skippedUsers).toBe(1);
    expect(result.failedUsers).toBe(0);
  });

  describe('ノート生成の組込（リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）', () => {
    /**
     * care=3・WEB fact ありの Topic を事前に用意する。consolidate の merge で
     * Care が +1 されて閾値（既定 3）を満たすようにする。
     */
    const preseedTopic = async (
      topicRepo: ReturnType<typeof makeRepos>['topicRepo']
    ): Promise<void> => {
      await topicRepo.putTopic({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-preseed',
        Subject: 'コーヒー',
        CanonicalSummary: 'ユーザーはコーヒーが好き',
        Category: '飲み物',
        Care: 3,
        Embedding: [1, 0],
      });
      await topicRepo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'topic-preseed',
        Text: 'コーヒーには覚醒作用がある',
        SourceUrls: ['https://example.com'],
        Volatility: 'stable',
        ObservedAt: fixedNow,
      });
    };

    /** consolidate は topic-preseed へ merge、ノート生成は指定した letter を返すクライアント */
    const makeMergeAndLetterClient = (letter: {
      skip: boolean;
      usedSelfHook: boolean;
      headline: string;
    }): ILLMClient => ({
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async chatStructured(messages) {
        const isConsolidate = messages.some((m) => m.content.includes('話題（Topic）ごとにまとめ'));
        if (isConsolidate) {
          return {
            topics: [{ ...makeTopicResult(), targetTopicId: 'topic-preseed' }],
          } as unknown as never;
        }
        return letter as unknown as never;
      },
      async summarize() {
        return { mergedSummary: '要約', newMemoryCandidates: [] };
      },
    });

    it('集約後に care 閾値以上・WEB ありの Topic はノートを生成し generatedNotes に集計する', async () => {
      const store = new InMemorySingleTableStore();
      const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo, noteRepo } =
        makeRepos(store);
      tick = fixedNow;
      await preseedTopic(topicRepo);
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: 'コーヒーについてもっと教えて',
      });
      await profileRepo.upsert({ UserID: 'u1' });

      const llmClient = makeMergeAndLetterClient({
        skip: false,
        usedSelfHook: false,
        headline: '気になって調べてみたよ。コーヒーには覚醒作用があるんだって！',
      });

      const result = await consolidateAllConversations({
        profileRepo,
        topicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        noteRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient(),
      });

      expect(result.generatedNotes).toBe(1);
      expect(result.processedUsers).toBe(1);
      const notes = await noteRepo.listAll('u1', 'hiyori');
      expect(notes).toHaveLength(1);
      expect(notes[0].TopicID).toBe('topic-preseed');
    });

    it('ノート生成が失敗しても集約バッチ全体は継続する（fail-warn）', async () => {
      const store = new InMemorySingleTableStore();
      const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo, noteRepo } =
        makeRepos(store);
      tick = fixedNow;
      await preseedTopic(topicRepo);
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: 'コーヒーについてもっと教えて',
      });
      await profileRepo.upsert({ UserID: 'u1' });

      jest.spyOn(noteRepo, 'put').mockRejectedValueOnce(new Error('note put failed'));

      const llmClient = makeMergeAndLetterClient({
        skip: false,
        usedSelfHook: false,
        headline: '気になって調べてみたよ。コーヒーには覚醒作用があるんだって！',
      });

      const result = await consolidateAllConversations({
        profileRepo,
        topicRepo,
        messageRepo,
        webRawRepo,
        cursorRepo,
        noteRepo,
        llmClient,
        embeddingClient: makeEmbeddingClient(),
      });

      // ノート生成は失敗するが、集約自体は成功しているので processedUsers はそのまま。
      // failedUsers には計上されない（fail-warn）。
      expect(result.generatedNotes).toBe(0);
      expect(result.processedUsers).toBe(1);
      expect(result.failedUsers).toBe(0);
    });
  });
});
