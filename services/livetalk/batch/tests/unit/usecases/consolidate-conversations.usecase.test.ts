import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  InMemoryTopicRepository,
  InMemoryMessageRepository,
  InMemoryWebRawRepository,
  InMemoryConsolidationCursorRepository,
  InMemoryProfileRepository,
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

const makeLLMClient = (): ILLMClient & { chatStructuredCalls: number } => {
  let chatStructuredCalls = 0;
  return {
    async *chatStream() {
      yield '';
    },
    async chatComplete() {
      return '';
    },
    async chatStructured() {
      chatStructuredCalls++;
      return { topics: [makeTopicResult()] } as unknown as never;
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
  const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo } = makeRepos();
  return {
    profileRepo,
    topicRepo,
    messageRepo,
    webRawRepo,
    cursorRepo,
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
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo } = makeRepos(store);
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
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo } = makeRepos(store);
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
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo } = makeRepos(store);
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
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo } = makeRepos(store);
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
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo } = makeRepos(store);
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
      llmClient: spyClient,
      embeddingClient: makeEmbeddingClient(),
    });

    expect(capturedNames.some((n) => n.includes('桃瀬ひより'))).toBe(true);
    expect(capturedNames.some((n) => !n.includes('桃瀬ひより'))).toBe(true);
  });

  it('未集約データのあるユーザーは processedUsers、ないユーザーは skippedUsers に計上される（混在ケース）', async () => {
    const llmClient = makeLLMClient();
    const store = new InMemorySingleTableStore();
    const { topicRepo, messageRepo, webRawRepo, cursorRepo, profileRepo } = makeRepos(store);
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
      llmClient,
      embeddingClient: makeEmbeddingClient(),
    });

    expect(result.processedUsers).toBe(1);
    expect(result.skippedUsers).toBe(1);
    expect(result.failedUsers).toBe(0);
  });
});
