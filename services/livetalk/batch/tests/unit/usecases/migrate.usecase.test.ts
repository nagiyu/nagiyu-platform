import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
import {
  InMemoryTopicRepository,
  InMemoryProfileRepository,
  type ILLMClient,
  type IEmbeddingClient,
} from '@nagiyu/livetalk-core';
import {
  runMigration,
  MIGRATE_ERROR_MESSAGES,
  type MigratePayload,
} from '../../../src/usecases/migrate.usecase.js';

const TABLE = 'nagiyu-livetalk-test';
const USER_ID = 'google-user-001';
const CHARACTER_ID = 'hiyori';
const FIXED_NOW = 1_750_000_000_000;

/**
 * `docClient.send(command)` を InMemorySingleTableStore に対する Query/BatchWrite/Get/Put の
 * 最小実装で肩代わりするテスト用フェイク。migrate usecase が使う 4 コマンドのみサポートする。
 */
function makeFakeDocClient(
  store: InMemorySingleTableStore,
  opts: { failOnPk?: string } = {}
): DynamoDBDocumentClient {
  const send = jest.fn(async (command: unknown) => {
    const name = (command as { constructor: { name: string } }).constructor.name;
    const input = (command as { input: Record<string, unknown> }).input;

    if (opts.failOnPk) {
      const values = input.ExpressionAttributeValues as Record<string, string> | undefined;
      if (values?.[':pk'] === opts.failOnPk) {
        throw new Error('DynamoDB 障害');
      }
    }

    if (name === 'QueryCommand') {
      const values = input.ExpressionAttributeValues as Record<string, string>;
      const { items } = store.query(
        { pk: values[':pk'], sk: { operator: 'begins_with', value: values[':prefix'] } },
        { limit: Number.MAX_SAFE_INTEGER }
      );
      return { Items: items };
    }

    if (name === 'BatchWriteCommand') {
      const requestItems = input.RequestItems as Record<
        string,
        Array<{ DeleteRequest?: { Key: { PK: string; SK: string } } }>
      >;
      for (const table of Object.keys(requestItems)) {
        for (const req of requestItems[table]) {
          if (req.DeleteRequest) {
            store.delete(req.DeleteRequest.Key.PK, req.DeleteRequest.Key.SK);
          }
        }
      }
      return {};
    }

    if (name === 'GetCommand') {
      const key = input.Key as { PK: string; SK: string };
      const item = store.get(key.PK, key.SK);
      return { Item: item };
    }

    if (name === 'PutCommand') {
      const item = input.Item as DynamoDBItem;
      const existing = store.get(item.PK, item.SK);
      const condition = input.ConditionExpression as string | undefined;
      if (condition === 'attribute_not_exists(PK)' && existing) {
        const err = new Error('conditional check failed');
        (err as Error & { name: string }).name = 'ConditionalCheckFailedException';
        throw err;
      }
      if (condition === 'UpdatedAt = :expectedUpdatedAt') {
        const values = input.ExpressionAttributeValues as Record<string, unknown>;
        if (!existing || existing.UpdatedAt !== values[':expectedUpdatedAt']) {
          const err = new Error('conditional check failed');
          (err as Error & { name: string }).name = 'ConditionalCheckFailedException';
          throw err;
        }
      }
      store.put(item);
      return {};
    }

    throw new Error(`未対応のコマンド: ${name}`);
  });

  return { send } as unknown as DynamoDBDocumentClient;
}

function seedLegacyMemory(
  store: InMemorySingleTableStore,
  userId: string,
  characterId: string,
  id: string,
  overrides: Partial<{
    Content: string;
    Category: string;
    Embedding: number[];
    ReferencedCount: number;
  }> = {}
): void {
  store.put({
    PK: `USER#${userId}`,
    SK: `CHAR#${characterId}#MEM#B#趣味#${id}`,
    Type: 'LegacyMemory',
    Content: 'コーヒーが好き',
    Category: '趣味',
    Tier: 'B',
    Confidence: 0.8,
    Embedding: [1, 0],
    ReferencedCount: 3,
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
    ...overrides,
  });
}

function seedLegacyKnowledge(
  store: InMemorySingleTableStore,
  userId: string,
  characterId: string,
  id: string
): void {
  store.put({
    PK: `USER#${userId}`,
    SK: `CHAR#${characterId}#KNOWLEDGE#${id}`,
    Type: 'LegacyKnowledge',
    Topic: 'コーヒー 効能',
    Summary: 'コーヒーには覚醒作用がある',
    SourceUrls: ['https://example.com'],
    RawComment: '',
    RelatedCategory: '趣味',
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
  });
}

function seedLegacyInterest(
  store: InMemorySingleTableStore,
  userId: string,
  characterId: string,
  overrides: Partial<{ Category: string; Weight: number; Embedding: number[] }> = {}
): void {
  store.put({
    PK: `USER#${userId}`,
    SK: `CHAR#${characterId}#INTEREST#趣味`,
    Type: 'LegacyInterestCategory',
    Category: '趣味',
    Weight: 2,
    Embedding: [1, 0],
    CreatedAt: FIXED_NOW,
    UpdatedAt: FIXED_NOW,
    ...overrides,
  });
}

const makeTopicResult = (overrides: Record<string, unknown> = {}) => ({
  targetTopicId: '',
  subject: 'コーヒー',
  category: '趣味',
  canonicalSummary: 'ユーザーはコーヒーが好き',
  selfFacts: [{ text: 'ユーザーはコーヒーが好き', provenance: '' }],
  webFacts: [],
  ...overrides,
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
    get chatStructuredCalls() {
      return chatStructuredCalls;
    },
  };
};

const makeEmbeddingClient = (vector: number[] = [1, 0]): IEmbeddingClient => ({
  embed: async () => vector,
});

function makeBasePayload(overrides: Partial<MigratePayload> = {}): MigratePayload {
  return {
    targetUserId: USER_ID,
    characterId: CHARACTER_ID,
    ...overrides,
  };
}

describe('runMigration', () => {
  it('dryRun（既定）では件数レポートのみ返し、書き込み・LLM 呼び出しを一切行わない', async () => {
    const legacyStore = new InMemorySingleTableStore();
    seedLegacyMemory(legacyStore, USER_ID, CHARACTER_ID, '01');
    seedLegacyKnowledge(legacyStore, USER_ID, CHARACTER_ID, '01');
    seedLegacyInterest(legacyStore, USER_ID, CHARACTER_ID);

    const topicStore = new InMemorySingleTableStore();
    const topicRepo = new InMemoryTopicRepository(topicStore, () => 'T', () => FIXED_NOW);
    const profileStore = new InMemorySingleTableStore();
    const profileRepo = new InMemoryProfileRepository(profileStore, () => FIXED_NOW);
    const llmClient = makeLLMClient();

    const result = await runMigration({
      payload: makeBasePayload(),
      profileRepo,
      docClient: makeFakeDocClient(legacyStore),
      tableName: TABLE,
      topicRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient(),
      env: 'dev',
      now: () => FIXED_NOW,
    });

    expect(result.processedScopes).toBe(1);
    expect(result.failedScopes).toBe(0);
    const [report] = result.scopeReports;
    expect(report.dryRun).toBe(true);
    expect(report.legacyMemoryCount).toBe(1);
    expect(report.legacyKnowledgeCount).toBe(1);
    expect(report.legacyInterestCount).toBe(1);
    expect(report.pseudoMessageCount).toBe(1);
    expect(report.pseudoWebRawCount).toBe(1);
    expect(report.plannedChunkCount).toBe(1);
    expect(report.migrated).toBe(false);
    expect(report.wiped).toBe(false);
    expect(report.deletedOld).toBe(false);

    expect(llmClient.chatStructuredCalls).toBe(0);
    expect((await topicRepo.listTopicHeaders(USER_ID, CHARACTER_ID)).length).toBe(0);
    // 旧アイテムも一切削除されない
    expect(legacyStore.size()).toBe(3);
  });

  it('migrate（非 dryRun）で Topic を生成し、care をシードし、実 CURSOR を runNow にセットする', async () => {
    const legacyStore = new InMemorySingleTableStore();
    seedLegacyMemory(legacyStore, USER_ID, CHARACTER_ID, '01', {
      Content: 'コーヒーが好き',
      Category: '趣味',
      Embedding: [1, 0],
      ReferencedCount: 3,
    });
    seedLegacyInterest(legacyStore, USER_ID, CHARACTER_ID, {
      Category: '趣味',
      Weight: 2,
      Embedding: [1, 0],
    });

    // topicRepo は docClient と同一ストアを共有する（本番の単一テーブル共有を模す）。
    const topicRepo = new InMemoryTopicRepository(legacyStore, () => 'TOPIC-1', () => FIXED_NOW);
    const profileRepo = new InMemoryProfileRepository(new InMemorySingleTableStore());
    const llmClient = makeLLMClient();
    const docClient = makeFakeDocClient(legacyStore);

    const result = await runMigration({
      payload: makeBasePayload({ dryRun: false, migrate: true }),
      profileRepo,
      docClient,
      tableName: TABLE,
      topicRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient([1, 0]),
      env: 'dev',
      now: () => FIXED_NOW,
    });

    expect(result.failedScopes).toBe(0);
    const [report] = result.scopeReports;
    expect(report.migrated).toBe(true);
    expect(report.consolidatedChunkCount).toBe(1);
    expect(llmClient.chatStructuredCalls).toBe(1);

    const headers = await topicRepo.listTopicHeaders(USER_ID, CHARACTER_ID);
    expect(headers).toHaveLength(1);
    // care シード: InterestCategory(weight正規化1) + Memory(ReferencedCount正規化1) = 2 加算
    // 新規 Topic 作成時の Care=1 と合わせて 3 になる
    expect(headers[0].Care).toBe(3);
    expect(report.careAppliedCount).toBe(1);

    const selfFacts = await topicRepo.listSelfFacts(USER_ID, CHARACTER_ID, headers[0].TopicID);
    expect(selfFacts[0].Provenance).toBe('旧Memory移行');

    // 実 CURSOR が runNow にセットされる
    expect(report.cursorAdvanced).toBe(true);
    const cursorItem = legacyStore.get(`USER#${USER_ID}`, `CHAR#${CHARACTER_ID}#CURSOR`);
    expect(cursorItem?.MsgCursor).toBe(FIXED_NOW);
    expect(cursorItem?.WebrawCursor).toBe(FIXED_NOW);
  });

  it('旧資材ゼロのスコープでは実 CURSOR を前進させない（正常系集約の取りこぼし防止）', async () => {
    // 旧 Memory/Knowledge を一切持たないスコープ（＝移行対象外）。
    const legacyStore = new InMemorySingleTableStore();
    // 既存の実 CURSOR（正常系 consolidation が進めた位置）を投入しておく。
    legacyStore.put({
      PK: `USER#${USER_ID}`,
      SK: `CHAR#${CHARACTER_ID}#CURSOR`,
      Type: 'ConsolidationCursor',
      UserID: USER_ID,
      CharacterID: CHARACTER_ID,
      MsgCursor: 100,
      WebrawCursor: 100,
      UpdatedAt: 100,
    });

    const topicRepo = new InMemoryTopicRepository(legacyStore, () => 'TOPIC-1', () => FIXED_NOW);
    const profileRepo = new InMemoryProfileRepository(new InMemorySingleTableStore());
    const llmClient = makeLLMClient();
    const docClient = makeFakeDocClient(legacyStore);

    const result = await runMigration({
      payload: makeBasePayload({ dryRun: false, migrate: true }),
      profileRepo,
      docClient,
      tableName: TABLE,
      topicRepo,
      llmClient,
      embeddingClient: makeEmbeddingClient(),
      env: 'dev',
      now: () => FIXED_NOW,
    });

    const [report] = result.scopeReports;
    expect(report.migrated).toBe(true);
    expect(report.plannedChunkCount).toBe(0);
    expect(report.consolidatedChunkCount).toBe(0);
    // LLM は呼ばれず、実 CURSOR は据え置き（100 のまま・前進しない）
    expect(llmClient.chatStructuredCalls).toBe(0);
    expect(report.cursorAdvanced).toBe(false);
    const cursorItem = legacyStore.get(`USER#${USER_ID}`, `CHAR#${CHARACTER_ID}#CURSOR`);
    expect(cursorItem?.MsgCursor).toBe(100);
    expect(cursorItem?.WebrawCursor).toBe(100);
  });

  it('wipeNewFirst は新スキーマのみを削除し、旧スキーマは残す', async () => {
    const legacyStore = new InMemorySingleTableStore();
    seedLegacyMemory(legacyStore, USER_ID, CHARACTER_ID, '01');
    // 新スキーマの Topic META を直接投入（wipeNewFirst の削除対象）
    legacyStore.put({
      PK: `USER#${USER_ID}`,
      SK: `CHAR#${CHARACTER_ID}#TOPIC#OLD-TOPIC#META`,
      Type: 'Topic',
      CreatedAt: FIXED_NOW,
      UpdatedAt: FIXED_NOW,
    });

    const topicRepo = new InMemoryTopicRepository(new InMemorySingleTableStore());
    const profileRepo = new InMemoryProfileRepository(new InMemorySingleTableStore());

    const result = await runMigration({
      payload: makeBasePayload({ dryRun: false, migrate: false, wipeNewFirst: true }),
      profileRepo,
      docClient: makeFakeDocClient(legacyStore),
      tableName: TABLE,
      topicRepo,
      llmClient: makeLLMClient(),
      embeddingClient: makeEmbeddingClient(),
      env: 'dev',
      now: () => FIXED_NOW,
    });

    const [report] = result.scopeReports;
    expect(report.wiped).toBe(true);
    expect(report.wipedCount).toBe(1);
    expect(legacyStore.get(`USER#${USER_ID}`, `CHAR#${CHARACTER_ID}#TOPIC#OLD-TOPIC#META`)).toBeUndefined();
    // 旧 Memory は残る
    expect(legacyStore.get(`USER#${USER_ID}`, `CHAR#${CHARACTER_ID}#MEM#B#趣味#01`)).toBeDefined();
  });

  it('deleteOldAfter は同一実行で migrate が成功したときのみ実行する', async () => {
    const legacyStore = new InMemorySingleTableStore();
    seedLegacyMemory(legacyStore, USER_ID, CHARACTER_ID, '01');

    // migrate=false のときは deleteOldAfter=true でもスキップされる
    const result1 = await runMigration({
      payload: makeBasePayload({ dryRun: false, migrate: false, deleteOldAfter: true }),
      profileRepo: new InMemoryProfileRepository(new InMemorySingleTableStore()),
      docClient: makeFakeDocClient(legacyStore),
      tableName: TABLE,
      topicRepo: new InMemoryTopicRepository(new InMemorySingleTableStore()),
      llmClient: makeLLMClient(),
      embeddingClient: makeEmbeddingClient(),
      env: 'dev',
      now: () => FIXED_NOW,
    });
    expect(result1.scopeReports[0].deletedOld).toBe(false);
    expect(legacyStore.get(`USER#${USER_ID}`, `CHAR#${CHARACTER_ID}#MEM#B#趣味#01`)).toBeDefined();

    // migrate=true & deleteOldAfter=true なら migrate 成功後に旧スキーマが削除される
    const result2 = await runMigration({
      payload: makeBasePayload({ dryRun: false, migrate: true, deleteOldAfter: true }),
      profileRepo: new InMemoryProfileRepository(new InMemorySingleTableStore()),
      docClient: makeFakeDocClient(legacyStore),
      tableName: TABLE,
      topicRepo: new InMemoryTopicRepository(new InMemorySingleTableStore()),
      llmClient: makeLLMClient(),
      embeddingClient: makeEmbeddingClient(),
      env: 'dev',
      now: () => FIXED_NOW,
    });
    expect(result2.scopeReports[0].deletedOld).toBe(true);
    expect(result2.scopeReports[0].deletedOldCount).toBe(1);
    expect(legacyStore.get(`USER#${USER_ID}`, `CHAR#${CHARACTER_ID}#MEM#B#趣味#01`)).toBeUndefined();
  });

  it('本番環境で破壊的操作かつ confirmEnv 未指定なら実行前に throw する', async () => {
    const legacyStore = new InMemorySingleTableStore();
    const docClient = makeFakeDocClient(legacyStore);

    await expect(
      runMigration({
        payload: makeBasePayload({ dryRun: false, migrate: true }),
        profileRepo: new InMemoryProfileRepository(new InMemorySingleTableStore()),
        docClient,
        tableName: TABLE,
        topicRepo: new InMemoryTopicRepository(new InMemorySingleTableStore()),
        llmClient: makeLLMClient(),
        embeddingClient: makeEmbeddingClient(),
        env: 'prod',
        now: () => FIXED_NOW,
      })
    ).rejects.toThrow(MIGRATE_ERROR_MESSAGES.本番未確認);

    // ガードで中断するため docClient には一切アクセスしない
    expect((docClient.send as jest.Mock)).not.toHaveBeenCalled();
  });

  it('本番環境でも confirmEnv="prod" を指定すれば実行できる', async () => {
    const legacyStore = new InMemorySingleTableStore();
    seedLegacyMemory(legacyStore, USER_ID, CHARACTER_ID, '01');

    const result = await runMigration({
      payload: makeBasePayload({ dryRun: false, migrate: true, confirmEnv: 'prod' }),
      profileRepo: new InMemoryProfileRepository(new InMemorySingleTableStore()),
      docClient: makeFakeDocClient(legacyStore),
      tableName: TABLE,
      topicRepo: new InMemoryTopicRepository(new InMemorySingleTableStore()),
      llmClient: makeLLMClient(),
      embeddingClient: makeEmbeddingClient(),
      env: 'prod',
      now: () => FIXED_NOW,
    });

    expect(result.scopeReports[0].migrated).toBe(true);
  });

  it('本番環境でも dryRun のときは confirmEnv 不要', async () => {
    const legacyStore = new InMemorySingleTableStore();
    const result = await runMigration({
      payload: makeBasePayload(),
      profileRepo: new InMemoryProfileRepository(new InMemorySingleTableStore()),
      docClient: makeFakeDocClient(legacyStore),
      tableName: TABLE,
      topicRepo: new InMemoryTopicRepository(new InMemorySingleTableStore()),
      llmClient: makeLLMClient(),
      embeddingClient: makeEmbeddingClient(),
      env: 'prod',
      now: () => FIXED_NOW,
    });
    expect(result.scopeReports[0].dryRun).toBe(true);
  });

  it("targetUserId='ALL' のとき profileRepo.listAllUserIds で全ユーザーを処理する", async () => {
    const legacyStore = new InMemorySingleTableStore();
    seedLegacyMemory(legacyStore, 'u1', CHARACTER_ID, '01');
    seedLegacyMemory(legacyStore, 'u2', CHARACTER_ID, '01');

    const profileStore = new InMemorySingleTableStore();
    const profileRepo = new InMemoryProfileRepository(profileStore, () => FIXED_NOW);
    await profileRepo.upsert({ UserID: 'u1' });
    await profileRepo.upsert({ UserID: 'u2' });

    const result = await runMigration({
      payload: makeBasePayload({ targetUserId: 'ALL' }),
      profileRepo,
      docClient: makeFakeDocClient(legacyStore),
      tableName: TABLE,
      topicRepo: new InMemoryTopicRepository(new InMemorySingleTableStore()),
      llmClient: makeLLMClient(),
      embeddingClient: makeEmbeddingClient(),
      env: 'dev',
      now: () => FIXED_NOW,
    });

    expect(result.processedScopes).toBe(2);
    expect(result.scopeReports.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('characterId 省略時は登録済み全キャラクターを走査する', async () => {
    const legacyStore = new InMemorySingleTableStore();
    const result = await runMigration({
      payload: makeBasePayload({ characterId: undefined }),
      profileRepo: new InMemoryProfileRepository(new InMemorySingleTableStore()),
      docClient: makeFakeDocClient(legacyStore),
      tableName: TABLE,
      topicRepo: new InMemoryTopicRepository(new InMemorySingleTableStore()),
      llmClient: makeLLMClient(),
      embeddingClient: makeEmbeddingClient(),
      env: 'dev',
      now: () => FIXED_NOW,
    });
    expect(result.scopeReports.length).toBeGreaterThanOrEqual(2);
    expect(result.scopeReports.map((r) => r.characterId)).toContain('hiyori');
    expect(result.scopeReports.map((r) => r.characterId)).toContain('ageha');
  });

  it('1 スコープの失敗は他スコープの処理を止めない（fail-warn）', async () => {
    const legacyStore = new InMemorySingleTableStore();
    seedLegacyMemory(legacyStore, 'u-ok', CHARACTER_ID, '01');

    const failingDocClient = makeFakeDocClient(legacyStore, { failOnPk: 'USER#u-fail' });

    const profileStore = new InMemorySingleTableStore();
    const profileRepo = new InMemoryProfileRepository(profileStore, () => FIXED_NOW);
    await profileRepo.upsert({ UserID: 'u-ok' });
    await profileRepo.upsert({ UserID: 'u-fail' });

    const result = await runMigration({
      payload: makeBasePayload({ targetUserId: 'ALL' }),
      profileRepo,
      docClient: failingDocClient,
      tableName: TABLE,
      topicRepo: new InMemoryTopicRepository(new InMemorySingleTableStore()),
      llmClient: makeLLMClient(),
      embeddingClient: makeEmbeddingClient(),
      env: 'dev',
      now: () => FIXED_NOW,
    });

    expect(result.processedScopes).toBe(1);
    expect(result.failedScopes).toBe(1);
    expect(result.failedScopeKeys).toEqual(['u-fail#hiyori']);
  });

  it('wipeNewFirst+migrate を 2 回連続実行しても同一結果に収束する（冪等性）', async () => {
    const legacyStore = new InMemorySingleTableStore();
    seedLegacyMemory(legacyStore, USER_ID, CHARACTER_ID, '01');

    // topicRepo は docClient と同一ストアを共有する（wipeNewFirst が実際に Topic を消して
    // migrate が作り直す、という本番の単一テーブル共有を模す）。
    let ulidSeq = 0;
    const topicRepo = new InMemoryTopicRepository(legacyStore, () => `TOPIC-${ulidSeq++}`, () => FIXED_NOW);
    const docClient = makeFakeDocClient(legacyStore);

    const runOnce = () =>
      runMigration({
        payload: makeBasePayload({ dryRun: false, migrate: true, wipeNewFirst: true }),
        profileRepo: new InMemoryProfileRepository(new InMemorySingleTableStore()),
        docClient,
        tableName: TABLE,
        topicRepo,
        llmClient: makeLLMClient(),
        embeddingClient: makeEmbeddingClient([1, 0]),
        env: 'dev',
        now: () => FIXED_NOW,
      });

    const result1 = await runOnce();
    const headersAfterFirst = await topicRepo.listTopicHeaders(USER_ID, CHARACTER_ID);

    const result2 = await runOnce();
    const headersAfterSecond = await topicRepo.listTopicHeaders(USER_ID, CHARACTER_ID);

    // wipe が新スキーマ（前回生成の Topic）を消してから migrate が作り直すため、
    // TopicID 自体は変わりうるが、Topic 件数は 2 回とも同数（1 件）に収束する。
    expect(result1.failedScopes).toBe(0);
    expect(result2.failedScopes).toBe(0);
    expect(headersAfterFirst).toHaveLength(1);
    expect(headersAfterSecond).toHaveLength(1);
  });
});
