import { InMemorySingleTableStore } from '@nagiyu/aws';
import { TopicRetriever } from '../../../src/knowledge/retrieval.js';
import { InMemoryTopicRepository } from '../../../src/repositories/in-memory-topic.repository.js';
import type { IEmbeddingClient } from '../../../src/llm-client/types.js';
import type { TopicRetrieveOptions } from '../../../src/knowledge/retrieval.js';

/** 角度（度）から単位円上のベクトルを作る（cosine similarity を意図通りに制御するため）。 */
function vecAtDegrees(deg: number): number[] {
  const rad = (deg * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad)];
}

function makeEmbeddingClient(embedding: number[] | Error): IEmbeddingClient {
  if (embedding instanceof Error) {
    return {
      embed: jest.fn(async () => {
        throw embedding;
      }),
    };
  }
  return { embed: jest.fn(async () => embedding) };
}

const baseOptions: TopicRetrieveOptions = {
  userInput: 'テスト発話',
  threshold: 0.4,
  topK: 5,
  relatedThreshold: 0.8,
  relatedMax: 2,
};

describe('TopicRetriever', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryTopicRepository;
  let now: number;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    now = 1_700_000_000_000;
    repo = new InMemoryTopicRepository(
      store,
      () => `ULID-${Math.random()}`,
      () => now
    );
  });

  async function putTopicAt(topicId: string, deg: number, subject = topicId) {
    return repo.putTopic({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: topicId,
      Subject: subject,
      CanonicalSummary: `${subject} の要約`,
      Category: 'カテゴリ',
      Care: 1,
      Embedding: vecAtDegrees(deg),
    });
  }

  it('embed 失敗時は空配列を返す（fail-warn）', async () => {
    await putTopicAt('T1', 0);
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(new Error('embed error')));

    const result = await retriever.retrieve('u1', 'hiyori', baseOptions);

    expect(result).toEqual([]);
  });

  it('Topic が 0 件なら空配列を返す', async () => {
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));
    const result = await retriever.retrieve('u1', 'hiyori', baseOptions);
    expect(result).toEqual([]);
  });

  it('閾値未満の Topic は候補から落ちる', async () => {
    // query = 0°。T-low は 90°（cos=0 < threshold 0.4）
    await putTopicAt('T-low', 90);
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));

    const result = await retriever.retrieve('u1', 'hiyori', baseOptions);

    expect(result).toEqual([]);
  });

  it('閾値以上の Topic は similarity 降順で返る', async () => {
    // query = 0°。cos(10°)=0.985, cos(30°)=0.866, cos(50°)=0.643（すべて閾値 0.4 以上）
    await putTopicAt('T-30', 30);
    await putTopicAt('T-10', 10);
    await putTopicAt('T-50', 50);
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));

    const result = await retriever.retrieve('u1', 'hiyori', { ...baseOptions, topK: 5 });

    expect(result.map((r) => r.topic.TopicID)).toEqual(['T-10', 'T-30', 'T-50']);
    expect(result.every((r) => r.via === 'direct')).toBe(true);
    // 降順であること
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].similarity).toBeGreaterThanOrEqual(result[i].similarity);
    }
  });

  it('topK で上位のみに切られる', async () => {
    await putTopicAt('T-0', 0); // cos=1.0
    await putTopicAt('T-10', 10); // cos≈0.985
    await putTopicAt('T-20', 20); // cos≈0.940
    await putTopicAt('T-45', 45); // cos≈0.707（threshold 0.5 なら候補だが topK で除外されうる）
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));

    const result = await retriever.retrieve('u1', 'hiyori', {
      ...baseOptions,
      threshold: 0.5,
      topK: 3,
      // related 展開を無効化し、topK による direct 選抜の切り詰めのみを検証する
      relatedThreshold: 0.999,
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.topic.TopicID)).toEqual(['T-0', 'T-10', 'T-20']);
  });

  it('1ホップ関連: direct 集合の座標近傍を relatedThreshold・relatedMax の範囲で追加する', async () => {
    // query = 0°。A = 60°（cos=0.5 ≥ threshold 0.4 → direct）
    // C1 = 90°, C2 = 85°, C3 = 95°（いずれも query との cos < 0.4 → direct 対象外）
    // A との cos: C1=cos(30)=0.866, C2=cos(25)=0.906, C3=cos(35)=0.819（すべて relatedThreshold 0.8 以上）
    await putTopicAt('A', 60);
    await putTopicAt('C1', 90);
    await putTopicAt('C2', 85);
    await putTopicAt('C3', 95);
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));

    const result = await retriever.retrieve('u1', 'hiyori', {
      ...baseOptions,
      threshold: 0.4,
      topK: 5,
      relatedThreshold: 0.8,
      relatedMax: 2,
    });

    const directIds = result.filter((r) => r.via === 'direct').map((r) => r.topic.TopicID);
    const relatedIds = result.filter((r) => r.via === 'related').map((r) => r.topic.TopicID);

    expect(directIds).toEqual(['A']);
    // relatedMax=2 のため類似度上位 2 件（C2, C1）のみ。C3 は除外される
    expect(relatedIds).toEqual(['C2', 'C1']);
  });

  it('direct と related は重複しない', async () => {
    await putTopicAt('A', 60);
    await putTopicAt('C1', 90);
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));

    const result = await retriever.retrieve('u1', 'hiyori', {
      ...baseOptions,
      threshold: 0.4,
      relatedThreshold: 0.8,
      relatedMax: 5,
    });

    const ids = result.map((r) => r.topic.TopicID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('related 候補が relatedThreshold 未満なら追加されない', async () => {
    // A=60°(direct)。D=200° は A との cos が大きく負のため related 対象外
    await putTopicAt('A', 60);
    await putTopicAt('D', 200);
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));

    const result = await retriever.retrieve('u1', 'hiyori', baseOptions);

    expect(result.map((r) => r.topic.TopicID)).toEqual(['A']);
  });

  it('選抜された Topic には SELF/WEB fact が付随する', async () => {
    const topic = await putTopicAt('A', 0, 'コーヒー');
    await repo.putSelfFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: topic.TopicID,
      Text: 'コーヒーが好き',
      Provenance: '',
    });
    await repo.putWebFact({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: topic.TopicID,
      Text: 'コーヒーは眠気覚ましに効果的',
      SourceUrls: ['https://example.com'],
      Volatility: 'stable',
      ObservedAt: now,
    });
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));

    const result = await retriever.retrieve('u1', 'hiyori', baseOptions);

    expect(result).toHaveLength(1);
    expect(result[0].selfFacts.map((f) => f.Text)).toEqual(['コーヒーが好き']);
    expect(result[0].webFacts.map((f) => f.Text)).toEqual(['コーヒーは眠気覚ましに効果的']);
  });

  it('getTopicBundle が失敗した Topic はスキップして継続する', async () => {
    await putTopicAt('A', 0);
    await putTopicAt('B', 5);
    const originalGetTopicBundle = repo.getTopicBundle.bind(repo);
    let callCount = 0;
    jest.spyOn(repo, 'getTopicBundle').mockImplementation(async (key) => {
      callCount++;
      if (key.topicId === 'A') throw new Error('bundle error');
      return originalGetTopicBundle(key);
    });
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));

    const result = await retriever.retrieve('u1', 'hiyori', baseOptions);

    expect(callCount).toBeGreaterThan(0);
    expect(result.map((r) => r.topic.TopicID)).toEqual(['B']);
  });

  it('listTopicHeaders が失敗した場合は空配列を返す（fail-warn）', async () => {
    jest.spyOn(repo, 'listTopicHeaders').mockRejectedValue(new Error('list error'));
    const retriever = new TopicRetriever(repo, makeEmbeddingClient(vecAtDegrees(0)));

    const result = await retriever.retrieve('u1', 'hiyori', baseOptions);

    expect(result).toEqual([]);
  });
});
