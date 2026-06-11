import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  InMemoryMemorySummaryRepository,
  InMemoryMessageRepository,
  InMemoryMemoryRepository,
  InMemoryProfileRepository,
  type ILLMClient,
} from '@nagiyu/livetalk-core';
import {
  compressAllConversations,
  type CompressAllConversationsParams,
} from '../../../src/usecases/compress-conversations.usecase.js';

const fixedNow = 1_750_000_000_000;
let tick = fixedNow;

const makeLLMClient = (): ILLMClient & { summarizeCalls: number } => {
  let summarizeCalls = 0;
  return {
    async *chatStream() {
      yield '';
    },
    async chatComplete() {
      return '';
    },
    async summarize() {
      summarizeCalls++;
      return { mergedSummary: '要約', newMemoryCandidates: [] };
    },
    get summarizeCalls() {
      return summarizeCalls;
    },
  };
};

const makeRepos = (sharedStore?: InMemorySingleTableStore) => {
  const store = sharedStore ?? new InMemorySingleTableStore();
  tick = fixedNow;
  const nowMs = () => tick;
  const ulidFactory = () => `ULID-${tick++}`;
  return {
    store,
    summaryRepo: new InMemoryMemorySummaryRepository(store, nowMs),
    messageRepo: new InMemoryMessageRepository(store, ulidFactory, nowMs),
    memoryRepo: new InMemoryMemoryRepository(store, ulidFactory, nowMs),
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
  overrides: Partial<CompressAllConversationsParams> = {}
): CompressAllConversationsParams => {
  const { summaryRepo, messageRepo, memoryRepo, profileRepo } = makeRepos();
  return {
    profileRepo,
    summaryRepo,
    messageRepo,
    memoryRepo,
    llmClient: makeLLMClient(),
    ...overrides,
  };
};

describe('compressAllConversations', () => {
  it('ユーザーが 0 件のとき LLM を呼ばない', async () => {
    const llmClient = makeLLMClient();
    const result = await compressAllConversations(makeParams({ llmClient }));
    expect(llmClient.summarizeCalls).toBe(0);
    expect(result.processedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
  });

  it('メッセージのないユーザーは処理をスキップする（LLM 呼び出しなし）', async () => {
    const llmClient = makeLLMClient();
    const profileRepo = await makeProfileRepoWithUsers(['u1', 'u2']);
    const result = await compressAllConversations(makeParams({ llmClient, profileRepo }));
    expect(llmClient.summarizeCalls).toBe(0);
    expect(result.processedUsers).toBe(0);
    expect(result.skippedUsers).toBe(2);
  });

  it('hiyori にメッセージのあるユーザー分だけ LLM を呼ぶ', async () => {
    const llmClient = makeLLMClient();
    const store = new InMemorySingleTableStore();
    const { summaryRepo, messageRepo, memoryRepo, profileRepo } = makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hello' });
    await profileRepo.upsert({ UserID: 'u1' });
    await profileRepo.upsert({ UserID: 'u2' });

    const result = await compressAllConversations({
      profileRepo,
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
    });

    expect(llmClient.summarizeCalls).toBe(1);
    // u1 はメッセージあり（processed）、u2 はメッセージなし（skipped）
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
      async summarize() {
        callCount++;
        if (callCount === 1) throw new Error('LLM 失敗');
        return { mergedSummary: '要約', newMemoryCandidates: [] };
      },
    };

    const store = new InMemorySingleTableStore();
    const { summaryRepo, messageRepo, memoryRepo, profileRepo } = makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hi' });
    tick++;
    await messageRepo.create({ UserID: 'u2', CharacterID: 'hiyori', Role: 'user', Text: 'hi2' });
    await profileRepo.upsert({ UserID: 'u1' });
    await profileRepo.upsert({ UserID: 'u2' });

    const result = await compressAllConversations({
      profileRepo,
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient: errorClient,
    });

    expect(result.failedUsers).toBe(1);
    expect(result.failedUserIds).toContain('u1');
    expect(result.processedUsers).toBe(1);
  });

  it('profileRepo が複数ユーザーを返すとき全ユーザーを処理する', async () => {
    const llmClient = makeLLMClient();
    const profileRepo = await makeProfileRepoWithUsers(['u1', 'u2']);

    const result = await compressAllConversations(
      makeParams({ llmClient, profileRepo })
    );

    expect(result.processedUsers).toBe(0);
    expect(result.skippedUsers).toBe(2);
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
      async summarize() {
        callCount++;
        // hiyori（1 回目）は成功、ageha（2 回目）は失敗
        if (callCount === 2) throw new Error('ageha LLM 失敗');
        return { mergedSummary: '要約', newMemoryCandidates: [] };
      },
    };

    const store = new InMemorySingleTableStore();
    const { summaryRepo, messageRepo, memoryRepo, profileRepo } = makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hi' });
    tick++;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'ageha', Role: 'user', Text: 'hi2' });
    await profileRepo.upsert({ UserID: 'u1' });

    const result = await compressAllConversations({
      profileRepo,
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient: partialErrorClient,
    });

    // 両キャラ試行されること（callCount は 2）
    expect(callCount).toBe(2);
    // キャラエラーがあるのでユーザーは failed
    expect(result.failedUsers).toBe(1);
    expect(result.failedUserIds).toContain('u1');
    expect(result.processedUsers).toBe(0);
  });

  it('複数キャラ（hiyori と ageha）両方のメッセージで LLM が 2 回呼ばれる', async () => {
    const llmClient = makeLLMClient();
    const store = new InMemorySingleTableStore();
    const { summaryRepo, messageRepo, memoryRepo, profileRepo } = makeRepos(store);
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

    const result = await compressAllConversations({
      profileRepo,
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
    });

    // hiyori と ageha の両方で summarize が呼ばれる
    expect(llmClient.summarizeCalls).toBe(2);
    expect(result.processedUsers).toBe(1);
    expect(result.failedUsers).toBe(0);
  });

  it('一方のキャラのみメッセージがある場合はそのキャラのみ LLM を呼ぶ', async () => {
    const llmClient = makeLLMClient();
    const store = new InMemorySingleTableStore();
    const { summaryRepo, messageRepo, memoryRepo, profileRepo } = makeRepos(store);
    tick = fixedNow;
    // ageha のみメッセージあり
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'ageha',
      Role: 'user',
      Text: 'ageha only',
    });
    await profileRepo.upsert({ UserID: 'u1' });

    const result = await compressAllConversations({
      profileRepo,
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
    });

    expect(llmClient.summarizeCalls).toBe(1);
    expect(result.processedUsers).toBe(1);
    expect(result.failedUsers).toBe(0);
  });

  it('characterName が各キャラの displayName で渡されること（hiyori は 桃瀬ひより）', async () => {
    const summarizeCalls: Array<string | undefined> = [];
    const spyClient: ILLMClient = {
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async summarize(input) {
        summarizeCalls.push(input.characterName);
        return { mergedSummary: '要約', newMemoryCandidates: [] };
      },
    };

    const store = new InMemorySingleTableStore();
    const { summaryRepo, messageRepo, memoryRepo, profileRepo } = makeRepos(store);
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hello' });
    tick++;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'ageha', Role: 'user', Text: 'hey' });
    await profileRepo.upsert({ UserID: 'u1' });

    await compressAllConversations({
      profileRepo,
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient: spyClient,
    });

    // hiyori の displayName は '桃瀬ひより'
    expect(summarizeCalls).toContain('桃瀬ひより');
    // ageha の displayName が含まれること（'早瀬アゲハ'）
    expect(summarizeCalls.some((name) => name !== '桃瀬ひより' && name !== undefined)).toBe(true);
  });

  it('メッセージのあるユーザーは processedUsers、ないユーザーは skippedUsers に計上される（混在ケース）', async () => {
    const llmClient = makeLLMClient();
    const store = new InMemorySingleTableStore();
    const { summaryRepo, messageRepo, memoryRepo, profileRepo } = makeRepos(store);
    tick = fixedNow;
    // u1 のみメッセージあり（processed）、u2 はメッセージなし（skipped）
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'hello' });
    await profileRepo.upsert({ UserID: 'u1' });
    await profileRepo.upsert({ UserID: 'u2' });

    const result = await compressAllConversations({
      profileRepo,
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
    });

    expect(result.processedUsers).toBe(1);
    expect(result.skippedUsers).toBe(1);
    expect(result.failedUsers).toBe(0);
  });
});
