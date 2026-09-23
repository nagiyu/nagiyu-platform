import { InMemorySingleTableStore } from '@nagiyu/aws';
import { forgetSelfFact } from '../../../src/usecases/forget-self-fact.usecase.js';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import { OptimisticLockError } from '../../../src/repositories/optimistic-lock.error.js';
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
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'TOPIC-1',
      Subject: 'コーヒー',
      CanonicalSummary: '元の要約',
      Category: '飲み物',
      Care: 3,
      Embedding: [0.1, 0.2, 0.3],
    });
    const fact1 = await repo.putSelfFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'TOPIC-1',
      Text: '朝コーヒーを飲む',
      Provenance: 'msg-1',
    });
    const fact2 = await repo.putSelfFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'TOPIC-1',
      Text: 'ブラックが好き',
      Provenance: 'msg-2',
    });
    return { topic, fact1, fact2 };
  }

  it('対象 SELF fact が削除される', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient();

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.FactID },
      { topicRepository: repo, llmClient }
    );

    const remaining = await repo.listSelfFacts('u1', 'hiyori', 'TOPIC-1');
    expect(remaining.map((f: SelfFactEntity) => f.FactID)).not.toContain(fact1.FactID);
  });

  it('残 fact から要約が再生成され putTopic で更新される', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient('新しい要約：ブラックが好き');

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.FactID },
      { topicRepository: repo, llmClient }
    );

    const updated = await repo.getTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-1',
    });
    expect(updated?.CanonicalSummary).toBe('新しい要約：ブラックが好き');
    expect(llmClient.chatStructured).toHaveBeenCalledTimes(1);
    const promptMessages = (llmClient.chatStructured as jest.Mock).mock.calls[0][0];
    const promptText = JSON.stringify(promptMessages);
    expect(promptText).toContain('ブラックが好き');
    expect(promptText).not.toContain('朝コーヒーを飲む');
  });

  it('Embedding/Care/Category/Subject は不変', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient();

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.FactID },
      { topicRepository: repo, llmClient }
    );

    const updated = await repo.getTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-1',
    });
    expect(updated?.Embedding).toEqual([0.1, 0.2, 0.3]);
    expect(updated?.Care).toBe(3);
    expect(updated?.Category).toBe('飲み物');
    expect(updated?.Subject).toBe('コーヒー');
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
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.FactID },
      { topicRepository: repo, llmClient }
    );

    expect(putCallCount).toBe(2);
    const updated = await repo.getTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'TOPIC-1',
    });
    expect(updated?.CanonicalSummary).toBe('リトライ後の要約');
  });

  it('リトライが尽きたら最後のエラーを throw する', async () => {
    const { fact1 } = await seedTopic();
    const llmClient = makeLLMClient();

    jest.spyOn(repo, 'putTopic').mockImplementation(async () => {
      throw new OptimisticLockError('Topic', 'u1#hiyori#TOPIC-1');
    });

    await expect(
      forgetSelfFact(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.FactID },
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
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.FactID },
        { topicRepository: repo, llmClient }
      )
    ).rejects.toThrow('別のエラー');
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
      { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-1', factId: fact1.FactID },
      { topicRepository: repo, llmClient }
    );

    expect(llmClient.chatStructured).not.toHaveBeenCalled();
  });

  it('残 fact が 0 件なら LLM を呼ばず空要約で putTopic する', async () => {
    const topic = await repo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'TOPIC-EMPTY',
      Subject: '空の話題',
      CanonicalSummary: '元の要約',
      Category: 'その他',
      Care: 1,
      Embedding: [0.5, 0.5],
    });
    const fact = await repo.putSelfFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: topic.TopicID,
      Text: '唯一の fact',
      Provenance: '',
    });
    const llmClient = makeLLMClient();

    await forgetSelfFact(
      { userId: 'u1', characterId: 'hiyori', topicId: topic.TopicID, factId: fact.FactID },
      { topicRepository: repo, llmClient }
    );

    expect(llmClient.chatStructured).not.toHaveBeenCalled();
    const updated = await repo.getTopic({
      userId: 'u1',
      characterId: 'hiyori',
      topicId: topic.TopicID,
    });
    expect(updated?.CanonicalSummary).toBe('');
  });
});
