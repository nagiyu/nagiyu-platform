import { InMemorySingleTableStore } from '@nagiyu/aws';
import { compressConversation } from '../../../src/usecases/compress-conversation.usecase.js';
import { InMemoryMemorySummaryRepository } from '../../../src/repositories/in-memory-memory-summary.repository.js';
import { InMemoryMessageRepository } from '../../../src/repositories/in-memory-message.repository.js';
import { InMemoryMemoryRepository } from '../../../src/repositories/in-memory-memory.repository.js';
import { InMemoryInterestRepository } from '../../../src/repositories/in-memory-interest.repository.js';
import { InMemoryCharacterStateRepository } from '../../../src/repositories/in-memory-character-state.repository.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { CompressConversationParams } from '../../../src/usecases/compress-conversation.usecase.js';

const fixedNow = 1_750_000_000_000;
let tick = fixedNow;

const makeLLMClient = (
  result: {
    mergedSummary: string;
    newMemoryCandidates: { category: string; content: string }[];
    interestCategories?: { category: string; weight: number }[];
    bidirectionalityScore?: number;
  } = {
    mergedSummary: '新要約',
    newMemoryCandidates: [],
  }
): ILLMClient & { summarizeCalls: number } => {
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
      return result;
    },
    get summarizeCalls() {
      return summarizeCalls;
    },
  };
};

const makeRepos = () => {
  const store = new InMemorySingleTableStore();
  tick = fixedNow;
  const nowMs = () => tick;
  const ulidFactory = () => `ULID-${tick++}`;

  return {
    summaryRepo: new InMemoryMemorySummaryRepository(store, nowMs),
    messageRepo: new InMemoryMessageRepository(store, ulidFactory, nowMs),
    memoryRepo: new InMemoryMemoryRepository(store, ulidFactory, nowMs),
  };
};

const makeParams = (
  overrides: Partial<CompressConversationParams> = {}
): CompressConversationParams => ({
  ...makeRepos(),
  llmClient: makeLLMClient(),
  characterName: 'ひより',
  now: () => fixedNow,
  ...overrides,
});

describe('compressConversation', () => {
  it('メッセージが 0 件のとき LLM を呼ばずに return する', async () => {
    const llmClient = makeLLMClient();
    const params = makeParams({ llmClient });
    await compressConversation('u1', 'hiyori', params);
    expect(llmClient.summarizeCalls).toBe(0);
  });

  it('メッセージがあれば LLM を 1 回呼ぶ', async () => {
    const llmClient = makeLLMClient();
    const { messageRepo, summaryRepo, memoryRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: 'こんにちは',
    });

    await compressConversation('u1', 'hiyori', {
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
      characterName: 'ひより',
      now: () => fixedNow,
    });

    expect(llmClient.summarizeCalls).toBe(1);
  });

  it('MEMORY#SUMMARY が更新される', async () => {
    const llmClient = makeLLMClient({ mergedSummary: '要約テキスト', newMemoryCandidates: [] });
    const { messageRepo, summaryRepo, memoryRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'テスト' });

    await compressConversation('u1', 'hiyori', {
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
      characterName: 'ひより',
      now: () => fixedNow,
    });

    const updated = await summaryRepo.get('u1', 'hiyori');
    expect(updated?.SummaryText).toBe('要約テキスト');
    expect(updated?.LastCompressedAt).toBe(fixedNow);
  });

  it('新規記憶候補が Tier C として保存される', async () => {
    const candidates = [
      { category: 'food', content: 'ケーキが好き' },
      { category: 'hobby', content: '映画が好き' },
    ];
    const llmClient = makeLLMClient({ mergedSummary: '要約', newMemoryCandidates: candidates });
    const { messageRepo, summaryRepo, memoryRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'テスト' });

    await compressConversation('u1', 'hiyori', {
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
      characterName: 'ひより',
      now: () => fixedNow,
    });

    const { items: foodMems } = await memoryRepo.listByTier('u1', 'hiyori', 'C');
    expect(foodMems).toHaveLength(2);
    const categories = foodMems.map((m) => m.Category).sort();
    expect(categories).toEqual(['food', 'hobby']);
    expect(foodMems.every((m) => m.Tier === 'C')).toBe(true);
  });

  it('前回圧縮以降のメッセージのみ処理する（listSince が lastCompressedAt を使う）', async () => {
    const capturedMessages: Array<{ role: string; text: string }> = [];
    const spyClient: ILLMClient = {
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async summarize(input) {
        capturedMessages.push(...input.newMessages);
        return { mergedSummary: '', newMemoryCandidates: [] };
      },
    };

    const { messageRepo, summaryRepo, memoryRepo } = makeRepos();
    tick = fixedNow;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: '古い' });
    const midPoint = tick;

    tick = midPoint + 1;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'assistant',
      Text: '新しい',
    });

    // lastCompressedAt = midPoint → midPoint より後のメッセージ（「新しい」）のみ対象
    await summaryRepo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      SummaryText: '既存要約',
      LastCompressedAt: midPoint,
    });

    await compressConversation('u1', 'hiyori', {
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient: spyClient,
      characterName: 'ひより',
      now: () => tick,
    });

    expect(capturedMessages).toHaveLength(1);
    expect(capturedMessages[0].text).toBe('新しい');
  });

  it('既存 summaryText が LLM に渡される', async () => {
    let capturedExisting: string | undefined = 'none';
    const spyClient: ILLMClient = {
      async *chatStream() {
        yield '';
      },
      async chatComplete() {
        return '';
      },
      async summarize(input) {
        capturedExisting = input.existingSummary;
        return { mergedSummary: '', newMemoryCandidates: [] };
      },
    };

    const { messageRepo, summaryRepo, memoryRepo } = makeRepos();
    tick = fixedNow;
    await summaryRepo.put({
      UserID: 'u1',
      CharacterID: 'hiyori',
      SummaryText: '既存の要約内容',
      LastCompressedAt: 0,
    });
    tick = fixedNow + 1;
    await messageRepo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'new' });

    await compressConversation('u1', 'hiyori', {
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient: spyClient,
      characterName: 'ひより',
    });

    expect(capturedExisting).toBe('既存の要約内容');
  });

  it('interestCategories が返ったら InterestRepository に保存する', async () => {
    const llmClient = makeLLMClient({
      mergedSummary: '要約',
      newMemoryCandidates: [],
      interestCategories: [
        { category: 'アニメ', weight: 2 },
        { category: 'コーヒー', weight: 1 },
      ],
    });
    const { messageRepo, summaryRepo, memoryRepo } = makeRepos();
    const interestRepo = new InMemoryInterestRepository(new InMemorySingleTableStore());
    tick = fixedNow;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: 'こんにちは',
    });

    await compressConversation('u1', 'hiyori', {
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
      characterName: 'ひより',
      now: () => fixedNow,
      interestRepo,
    });

    const all = await interestRepo.list('u1', 'hiyori');
    expect(all).toHaveLength(2);
    expect(all.map((i) => i.Category).sort()).toEqual(['アニメ', 'コーヒー'].sort());
  });

  it('bidirectionalityScore が返ったら CharacterState の AffectionLevel を更新する', async () => {
    const llmClient = makeLLMClient({
      mergedSummary: '要約',
      newMemoryCandidates: [],
      bidirectionalityScore: 1.0,
    });
    const { messageRepo, summaryRepo, memoryRepo } = makeRepos();
    const characterStateRepo = new InMemoryCharacterStateRepository(new InMemorySingleTableStore());
    tick = fixedNow;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: 'こんにちは',
    });

    await compressConversation('u1', 'hiyori', {
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
      characterName: 'ひより',
      now: () => fixedNow,
      characterStateRepo,
    });

    const state = await characterStateRepo.getById({ userId: 'u1', characterId: 'hiyori' });
    expect(state?.AffectionLevel).toBeGreaterThan(0);
  });

  it('bidirectionalityScore が 0 のときは AffectionLevel を更新しない', async () => {
    const llmClient = makeLLMClient({
      mergedSummary: '要約',
      newMemoryCandidates: [],
      bidirectionalityScore: 0,
    });
    const { messageRepo, summaryRepo, memoryRepo } = makeRepos();
    const characterStateRepo = new InMemoryCharacterStateRepository(new InMemorySingleTableStore());
    tick = fixedNow;
    await messageRepo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: 'こんにちは',
    });

    await compressConversation('u1', 'hiyori', {
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
      characterName: 'ひより',
      now: () => fixedNow,
      characterStateRepo,
    });

    // delta=0 なので updateAffection は呼ばれず、state は存在しない
    const state = await characterStateRepo.getById({ userId: 'u1', characterId: 'hiyori' });
    expect(state).toBeNull();
  });
});
