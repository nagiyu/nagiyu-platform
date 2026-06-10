import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryMessageRepository, InMemoryLifecycleRepository } from '@nagiyu/livetalk-core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  learnAllUserActivities,
  type LearnAllUserActivitiesParams,
} from '../../../src/usecases/learn-user-activity.usecase.js';

const fixedNow = 1_750_000_000_000;
let tick = fixedNow;

const makeRepos = () => {
  const store = new InMemorySingleTableStore();
  tick = fixedNow;
  const nowMs = () => tick;
  const ulidFactory = () => `ULID-${tick++}`;
  return {
    messageRepo: new InMemoryMessageRepository(store, ulidFactory, nowMs),
    lifecycleRepo: new InMemoryLifecycleRepository(store, nowMs),
    store,
  };
};

const makeDocClientMock = (userIds: string[]): DynamoDBDocumentClient => {
  const items = userIds.map((id) => ({ UserID: id }));
  return {
    send: async () => ({ Items: items }),
  } as unknown as DynamoDBDocumentClient;
};

const makeParams = (
  overrides: Partial<LearnAllUserActivitiesParams> = {}
): LearnAllUserActivitiesParams => {
  const { messageRepo, lifecycleRepo } = makeRepos();
  return {
    docClient: makeDocClientMock([]),
    tableName: 'test-table',
    messageRepo,
    lifecycleRepo,
    ...overrides,
  };
};

describe('learnAllUserActivities', () => {
  it('ユーザーが 0 件のとき processedUsers=0 を返す', async () => {
    const result = await learnAllUserActivities(makeParams());
    expect(result.processedUsers).toBe(0);
    expect(result.skippedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
  });

  it('メッセージのないユーザーは全キャラ skipped にカウントされる', async () => {
    const docClient = makeDocClientMock(['u1', 'u2']);
    const result = await learnAllUserActivities(makeParams({ docClient }));
    expect(result.skippedUsers).toBe(2);
    expect(result.processedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
  });

  it('hiyori に 5 件以上メッセージのあるユーザーは processedUsers にカウントされる', async () => {
    const store = new InMemorySingleTableStore();
    tick = fixedNow;
    const nowMs = () => tick;
    const ulidFactory = () => `ULID-${tick++}`;
    const messageRepo = new InMemoryMessageRepository(store, ulidFactory, nowMs);
    const lifecycleRepo = new InMemoryLifecycleRepository(store, nowMs);

    // u1 に user ロールのメッセージを 5 件作成（fixedNow の 10 日前 = 30 日ウィンドウ内）
    const recentBase = fixedNow - 10 * 24 * 3600 * 1000;
    for (let i = 0; i < 5; i++) {
      tick = recentBase + i * 3600 * 1000;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: `msg ${i}`,
      });
    }
    // u2 はメッセージなし

    const docClient = makeDocClientMock(['u1', 'u2']);
    const result = await learnAllUserActivities({
      docClient,
      tableName: 'test',
      messageRepo,
      lifecycleRepo,
      now: () => new Date(fixedNow),
    });

    expect(result.processedUsers).toBe(1);
    expect(result.skippedUsers).toBe(1);
    expect(result.failedUsers).toBe(0);
  });

  it('ageha に 5 件以上メッセージのあるユーザーは processedUsers にカウントされる', async () => {
    const store = new InMemorySingleTableStore();
    tick = fixedNow;
    const nowMs = () => tick;
    const ulidFactory = () => `ULID-${tick++}`;
    const messageRepo = new InMemoryMessageRepository(store, ulidFactory, nowMs);
    const lifecycleRepo = new InMemoryLifecycleRepository(store, nowMs);

    const recentBase = fixedNow - 10 * 24 * 3600 * 1000;
    for (let i = 0; i < 5; i++) {
      tick = recentBase + i * 3600 * 1000;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'ageha',
        Role: 'user',
        Text: `ageha msg ${i}`,
      });
    }

    const docClient = makeDocClientMock(['u1']);
    const result = await learnAllUserActivities({
      docClient,
      tableName: 'test',
      messageRepo,
      lifecycleRepo,
      now: () => new Date(fixedNow),
    });

    expect(result.processedUsers).toBe(1);
    expect(result.skippedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
  });

  it('hiyori と ageha 両方に 5 件以上メッセージがある場合は processedUsers に 1 回だけカウントされる', async () => {
    const store = new InMemorySingleTableStore();
    tick = fixedNow;
    const nowMs = () => tick;
    const ulidFactory = () => `ULID-${tick++}`;
    const messageRepo = new InMemoryMessageRepository(store, ulidFactory, nowMs);
    const lifecycleRepo = new InMemoryLifecycleRepository(store, nowMs);

    const recentBase = fixedNow - 10 * 24 * 3600 * 1000;
    for (let i = 0; i < 5; i++) {
      tick = recentBase + i * 3600 * 1000;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: `hiyori msg ${i}`,
      });
    }
    for (let i = 0; i < 5; i++) {
      tick = recentBase + (i + 5) * 3600 * 1000;
      await messageRepo.create({
        UserID: 'u1',
        CharacterID: 'ageha',
        Role: 'user',
        Text: `ageha msg ${i}`,
      });
    }

    const docClient = makeDocClientMock(['u1']);
    const result = await learnAllUserActivities({
      docClient,
      tableName: 'test',
      messageRepo,
      lifecycleRepo,
      now: () => new Date(fixedNow),
    });

    // 1 ユーザーが両キャラで learned されても processedUsers は 1
    expect(result.processedUsers).toBe(1);
    expect(result.skippedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
  });

  it('ユーザー処理が失敗しても他のユーザーは処理継続する', async () => {
    const { lifecycleRepo } = makeRepos();
    const failingLifecycleRepo = {
      ...lifecycleRepo,
      updateUserActivityProfile: jest.fn().mockRejectedValue(new Error('DB エラー')),
      get: jest.fn().mockResolvedValue(null),
    };

    const store = new InMemorySingleTableStore();
    tick = fixedNow;
    const ulidFactory = () => `ULID-${tick++}`;
    const failingMessageRepo = new InMemoryMessageRepository(store, ulidFactory, () => tick);

    // u1 に 5 件（fixedNow の 10 日前 = 30 日ウィンドウ内）
    const recentBase = fixedNow - 10 * 24 * 3600 * 1000;
    for (let i = 0; i < 5; i++) {
      tick = recentBase + i * 3600 * 1000;
      await failingMessageRepo.create({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: `msg ${i}`,
      });
    }

    const docClient = makeDocClientMock(['u1', 'u2']);
    const result = await learnAllUserActivities({
      docClient,
      tableName: 'test',
      messageRepo: failingMessageRepo,
      lifecycleRepo: failingLifecycleRepo as never,
      now: () => new Date(fixedNow),
    });

    expect(result.failedUsers).toBeGreaterThanOrEqual(1);
    expect(result.failedUserIds).toContain('u1');
  });

  it('DynamoDB の Scan がページネーションする場合も全ユーザーを取得する', async () => {
    const { messageRepo, lifecycleRepo } = makeRepos();
    let callCount = 0;
    const paginatedDocClient = {
      send: async () => {
        callCount++;
        if (callCount === 1) {
          return { Items: [{ UserID: 'u1' }], LastEvaluatedKey: { PK: 'USER#u1' } };
        }
        return { Items: [{ UserID: 'u2' }] };
      },
    } as unknown as DynamoDBDocumentClient;

    const result = await learnAllUserActivities({
      docClient: paginatedDocClient,
      tableName: 'test',
      messageRepo,
      lifecycleRepo,
    });

    expect(result.skippedUsers).toBe(2);
    expect(callCount).toBe(2);
  });

  it('あるキャラクター処理がエラーでも他キャラは処理され、ユーザーは failed に計上される', async () => {
    const { lifecycleRepo } = makeRepos();
    let callCount = 0;
    const failingLifecycleRepo = {
      ...lifecycleRepo,
      updateUserActivityProfile: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('hiyori の学習エラー');
        // 2 回目（ageha）は成功
      }),
    };

    const store = new InMemorySingleTableStore();
    tick = fixedNow;
    const ulidFactory = () => `ULID-${tick++}`;
    const messageRepo = new InMemoryMessageRepository(store, ulidFactory, () => tick);

    // u1 の hiyori と ageha に 5 件ずつメッセージを作成
    const recentBase = fixedNow - 10 * 24 * 3600 * 1000;
    for (const characterId of ['hiyori', 'ageha']) {
      for (let i = 0; i < 5; i++) {
        tick = recentBase + i * 3600 * 1000;
        await messageRepo.create({
          UserID: 'u1',
          CharacterID: characterId,
          Role: 'user',
          Text: `msg ${i}`,
        });
      }
    }

    const docClient = makeDocClientMock(['u1']);
    const result = await learnAllUserActivities({
      docClient,
      tableName: 'test',
      messageRepo,
      lifecycleRepo: failingLifecycleRepo as never,
      now: () => new Date(fixedNow),
    });

    // u1 はキャラエラーがあるので failed に計上
    expect(result.failedUsers).toBe(1);
    expect(result.failedUserIds).toContain('u1');
  });
});
