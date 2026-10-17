import { EntityNotFoundError, InMemorySingleTableStore, OptimisticLockError } from '@nagiyu/aws';
import { forgetSelfFact } from '../../../src/usecases/forget-self-fact.usecase.js';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { SelfFactEntity } from '../../../src/entities/self-fact.entity.js';

function makeLLMClient(canonicalSummary = '再生成された要約'): ILLMClient {
  return {
    chatStream: jest.fn(),
    chatComplete: jest.fn(),
    chatStructured: jest.fn(async () => ({
      canonicalSummary,
    })) as unknown as ILLMClient['chatStructured'],
  };
}

describe('forgetSelfFact', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryTopicRepository;
  let now: number;
  let ulidCounter: number;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = 1_700_000_000_000;
    ulidCounter = 0;
    repo = new InMemoryTopicRepository(
      store,
      () => `ULID-${ulidCounter++}`,
      () => now
    );
  });

  async function seedTopic() {
    const topic = await repo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-1',
      subject: 'コーヒー',
      canonicalSummary: '元の要約',
      category: '飲み物',
      care: 3,
      embedding: [0.1, 0.2, 0.3],
    });
    const fact1 = await repo.putSelfFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-1',
      text: '朝コーヒーを飲む',
      provenance: 'msg-1',
    });
    const fact2 = await repo.putSelfFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-1',
      text: 'ブラックが好き',
      provenance: 'msg-2',
    });
    return { topic, fact1, fact2 };
  }

  it('対象 SELF fact が削除される', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient();

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.factId },
      { topicRepository: repo, llmClient }
    );

    const remaining = await repo.listSelfFacts('u1', 'hiyori', 'TOPIC-1');
    expect(remaining.map((f: SelfFactEntity) => f.factId)).not.toContain(fact1.factId);
  });

  it('残 fact から要約が再生成され putTopic で更新される', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient('新しい要約：ブラックが好き');

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.factId },
      { topicRepository: repo, llmClient }
    );

    const updated = await repo.getTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-1',
    });
    expect(updated?.canonicalSummary).toBe('新しい要約：ブラックが好き');
    expect(llmClient.chatStructured).toHaveBeenCalledTimes(1);
    const promptMessages = (llmClient.chatStructured as jest.Mock).mock.calls[0][0];
    const promptText = JSON.stringify(promptMessages);
    expect(promptText).toContain('ブラックが好き');
    expect(promptText).not.toContain('朝コーヒーを飲む');
  });

  it('embedding/care/category/subject は不変', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient();

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.factId },
      { topicRepository: repo, llmClient }
    );

    const updated = await repo.getTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-1',
    });
    expect(updated?.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(updated?.care).toBe(3);
    expect(updated?.category).toBe('飲み物');
    expect(updated?.subject).toBe('コーヒー');
  });

  it('OptimisticLockError で 1 回リトライして成功する', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient('リトライ後の要約');

    const originalPutTopic = repo.putTopic.bind(repo);
    let putCallCount = 0;
    jest.spyOn(repo, 'putTopic').mockImplementation(async (input, opts) => {
      putCallCount++;
      if (putCallCount === 1) {
        throw new OptimisticLockError('Topic', 'u1#hiyori#TOPIC-1');
      }
      return originalPutTopic(input, opts);
    });

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.factId },
      { topicRepository: repo, llmClient }
    );

    expect(putCallCount).toBe(2);
    const updated = await repo.getTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-1',
    });
    expect(updated?.canonicalSummary).toBe('リトライ後の要約');
  });

  it('リトライが尽きたら最後のエラーを throw する', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient();

    jest.spyOn(repo, 'putTopic').mockImplementation(async () => {
      throw new OptimisticLockError('Topic', 'u1#hiyori#TOPIC-1');
    });

    await expect(
      forgetSelfFact(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.factId },
        { topicRepository: repo, llmClient, maxRetries: 2 }
      )
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });

  it('OptimisticLockError 以外の例外はリトライせずそのまま throw する', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient();

    jest.spyOn(repo, 'putTopic').mockImplementation(async () => {
      throw new Error('別のエラー');
    });

    await expect(
      forgetSelfFact(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.factId },
        { topicRepository: repo, llmClient }
      )
    ).rejects.toThrow('別のエラー');
  });

  it('対象の SELF fact が存在しなければ EntityNotFoundError を投げ、要約を再生成しない', async () => {
    await seedTopic();
    const llmClient = makeLLMClient();

    await expect(
      forgetSelfFact(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: 'missing' },
        { topicRepository: repo, llmClient }
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(llmClient.chatStructured).not.toHaveBeenCalled();
  });

  it('書き込み時に Topic が消えていたら再読込して、再生成せず成功で終える', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient();
    const originalGetBundle = repo.getTopicBundle.bind(repo);
    let bundleCallCount = 0;
    jest.spyOn(repo, 'getTopicBundle').mockImplementation(async (key) => {
      bundleCallCount++;
      // 2 回目の読み取りでは Topic が消えている
      return bundleCallCount === 1
        ? originalGetBundle(key)
        : { topic: null, selfFacts: [], webFacts: [] };
    });
    jest.spyOn(repo, 'putTopic').mockImplementation(async () => {
      throw new EntityNotFoundError('Topic', 'u1#hiyori#TOPIC-1');
    });

    await expect(
      forgetSelfFact(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.factId },
        { topicRepository: repo, llmClient }
      )
    ).resolves.toBeUndefined();
    expect(bundleCallCount).toBe(2);
    expect(llmClient.chatStructured).toHaveBeenCalledTimes(1);
  });

  it('Topic が既に存在しなければ LLM を呼ばず return する', async () => {
    const { fact1 } = await seedTopic();
    // Topic ごと削除済み（本来ありえないが、念のための防御分岐を確認）のケースを
    // getTopicBundle スタブで再現する。
    jest
      .spyOn(repo, 'getTopicBundle')
      .mockResolvedValue({ topic: null, selfFacts: [], webFacts: [] });
    const llmClient = makeLLMClient();

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.factId },
      { topicRepository: repo, llmClient }
    );

    expect(llmClient.chatStructured).not.toHaveBeenCalled();
  });

  it('残 fact が 0 件なら LLM を呼ばず空要約で putTopic する', async () => {
    const topic = await repo.putTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-EMPTY',
      subject: '空の話題',
      canonicalSummary: '元の要約',
      category: 'その他',
      care: 1,
      embedding: [0.5, 0.5],
    });
    const fact = await repo.putSelfFact({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: topic.topicId,
      text: '唯一の fact',
      provenance: '',
    });
    const llmClient = makeLLMClient();

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: topic.topicId, factId: fact.factId },
      { topicRepository: repo, llmClient }
    );

    expect(llmClient.chatStructured).not.toHaveBeenCalled();
    const updated = await repo.getTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: topic.topicId,
    });
    expect(updated?.canonicalSummary).toBe('');
  });
});
