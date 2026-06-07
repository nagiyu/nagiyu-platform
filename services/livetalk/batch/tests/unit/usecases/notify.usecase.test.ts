import { type VapidConfig } from '@nagiyu/common/push';

jest.mock('@nagiyu/common', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  toErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

jest.mock('@nagiyu/common/push', () => ({
  sendWebPushNotification: jest.fn(),
  getVapidConfig: jest.fn(
    () =>
      ({
        subject: 'mailto:test@example.com',
        publicKey: 'pub',
        privateKey: 'priv',
      }) satisfies VapidConfig
  ),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  DEFAULT_CHARACTER_ID: 'hiyori',
  buildNotificationMessage: jest.fn(() => ({ title: 'テスト', body: '本文' })),
  buildCriticalNotificationMessage: jest.fn(() => ({ title: 'テスト（重要）', body: '重要本文' })),
  detectCriticalKnowledge: jest.fn(),
  shouldNotifyNow: jest.fn(),
  defaultUlidFactory: jest.fn(() => 'ULID-0001'),
  NOTIFICATION_EVENT_TTL_SECONDS: 2592000,
  DynamoDBInterestRepository: jest.fn(),
  OpenAIEmbeddingClient: jest.fn(),
}));

const mockSendWebPush = jest.requireMock('@nagiyu/common/push')
  .sendWebPushNotification as jest.Mock;
const core = jest.requireMock('@nagiyu/livetalk-core');
const mockDetectCritical = core.detectCriticalKnowledge as jest.Mock;
const mockShouldNotifyNow = core.shouldNotifyNow as jest.Mock;

function makeDocClient() {
  return {
    send: jest.fn().mockResolvedValue({
      Items: [{ UserID: 'u1' }],
    }),
  };
}

function makeLifecycleRepo(
  lifecycle = {
    UserID: 'u1',
    CharacterID: 'hiyori',
    Bedtime: '01:30',
    WakeUpTime: '09:30',
    CreatedAt: 0,
    UpdatedAt: 0,
  }
) {
  return { get: jest.fn().mockResolvedValue(lifecycle) };
}

function makeMessageRepo() {
  return {
    getRecentByTokenBudget: jest.fn().mockResolvedValue({
      messages: [{ Role: 'user', CreatedAt: 1000 }],
      totalTokens: 5,
      truncated: false,
    }),
  };
}

function makeKnowledgeRepo() {
  return {
    list: jest.fn().mockResolvedValue([{ KnowledgeID: 'k1', Topic: 'TypeScript' }]),
  };
}

function makePushSubscriptionRepo(
  subscriptions = [
    {
      SubscriptionID: 'sub_1',
      Endpoint: 'https://push.example.com/1',
      P256dhKey: 'p',
      AuthKey: 'a',
    },
  ]
) {
  return {
    listByUser: jest.fn().mockResolvedValue(subscriptions),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function makeNotifEventRepo() {
  return {
    listByUser: jest.fn().mockResolvedValue([]),
    put: jest.fn().mockResolvedValue({}),
  };
}

function makeLlmClient() {
  return {};
}

function makeInterestRepo() {
  return {
    list: jest.fn().mockResolvedValue([]),
  };
}

function makeEmbeddingClient() {
  return {
    embed: jest.fn().mockResolvedValue([0, 0, 0]),
  };
}

function makeParams(overrides = {}) {
  return {
    docClient: makeDocClient() as never,
    tableName: 'test-table',
    lifecycleRepo: makeLifecycleRepo() as never,
    messageRepo: makeMessageRepo() as never,
    knowledgeRepo: makeKnowledgeRepo() as never,
    pushSubscriptionRepo: makePushSubscriptionRepo() as never,
    notifEventRepo: makeNotifEventRepo() as never,
    interestRepo: makeInterestRepo() as never,
    llmClient: makeLlmClient() as never,
    embeddingClient: makeEmbeddingClient() as never,
    ...overrides,
  };
}

describe('notifyAllUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 各テストで send は 1 件のユーザーを返す
    makeDocClient().send.mockResolvedValue({ Items: [{ UserID: 'u1' }] });
  });

  it('shouldNotifyNow が通知発火 → notifiedUsers が増える', async () => {
    mockDetectCritical.mockResolvedValue({ isCritical: false });
    mockShouldNotifyNow.mockReturnValue({
      notify: true,
      kind: 'normal',
      toneBucket: 'normal',
      elapsedMs: 86400000,
    });
    mockSendWebPush.mockResolvedValue(true);

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(makeParams());

    expect(result.notifiedUsers).toBe(1);
    expect(result.skippedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
  });

  it('shouldNotifyNow が not_due → skippedUsers が増える', async () => {
    mockDetectCritical.mockResolvedValue({ isCritical: false });
    mockShouldNotifyNow.mockReturnValue({ notify: false, reason: 'not_due' });

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(makeParams());

    expect(result.notifiedUsers).toBe(0);
    expect(result.skippedUsers).toBe(1);
  });

  it('lifecycle が null のユーザーはスキップ', async () => {
    const lifecycleRepo = { get: jest.fn().mockResolvedValue(null) };
    mockDetectCritical.mockResolvedValue({ isCritical: false });
    mockShouldNotifyNow.mockReturnValue({ notify: false, reason: 'not_due' });

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(makeParams({ lifecycleRepo: lifecycleRepo as never }));

    expect(result.skippedUsers).toBe(1);
    expect(mockShouldNotifyNow).not.toHaveBeenCalled();
  });

  it('サブスクリプションなしのユーザーはスキップ', async () => {
    const pushSubscriptionRepo = makePushSubscriptionRepo([]);
    mockDetectCritical.mockResolvedValue({ isCritical: false });
    mockShouldNotifyNow.mockReturnValue({
      notify: true,
      kind: 'normal',
      toneBucket: 'normal',
      elapsedMs: DAY,
    });

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(
      makeParams({ pushSubscriptionRepo: pushSubscriptionRepo as never })
    );

    expect(result.skippedUsers).toBe(1);
    expect(mockSendWebPush).not.toHaveBeenCalled();
  });

  it('critical 判定 → buildCriticalNotificationMessage が呼ばれる', async () => {
    mockDetectCritical.mockResolvedValue({ isCritical: true, knowledgeId: 'k1' });
    mockShouldNotifyNow.mockReturnValue({ notify: true, kind: 'critical', knowledgeId: 'k1' });
    mockSendWebPush.mockResolvedValue(true);

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    await notifyAllUsers(makeParams());

    expect(core.buildCriticalNotificationMessage).toHaveBeenCalled();
  });

  it('Push 送信が false を返す（無効サブスクリプション）→ サブスクリプションを削除', async () => {
    mockDetectCritical.mockResolvedValue({ isCritical: false });
    mockShouldNotifyNow.mockReturnValue({
      notify: true,
      kind: 'normal',
      toneBucket: 'normal',
      elapsedMs: DAY,
    });
    mockSendWebPush.mockResolvedValue(false); // 無効

    const pushSubscriptionRepo = makePushSubscriptionRepo();
    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    await notifyAllUsers(makeParams({ pushSubscriptionRepo: pushSubscriptionRepo as never }));

    expect(pushSubscriptionRepo.delete).toHaveBeenCalledWith({
      userId: 'u1',
      subscriptionId: 'sub_1',
    });
  });

  it('全送信が false でも notifEvent は保存されない（sentCount=0）', async () => {
    mockDetectCritical.mockResolvedValue({ isCritical: false });
    mockShouldNotifyNow.mockReturnValue({
      notify: true,
      kind: 'normal',
      toneBucket: 'normal',
      elapsedMs: DAY,
    });
    mockSendWebPush.mockResolvedValue(false);

    const notifEventRepo = makeNotifEventRepo();
    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(makeParams({ notifEventRepo: notifEventRepo as never }));

    expect(notifEventRepo.put).not.toHaveBeenCalled();
    expect(result.skippedUsers).toBe(1); // sentCount=0 → skipped
  });

  it('ユーザー処理で例外 → failedUsers にカウントしてループ継続', async () => {
    const docClient = {
      send: jest.fn().mockResolvedValue({
        Items: [{ UserID: 'u1' }, { UserID: 'u2' }],
      }),
    };
    const lifecycleRepo = {
      get: jest.fn().mockRejectedValue(new Error('DynamoDB エラー')),
    };

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(
      makeParams({ docClient: docClient as never, lifecycleRepo: lifecycleRepo as never })
    );

    expect(result.failedUsers).toBe(2);
    expect(result.failedUserIds).toContain('u1');
    expect(result.failedUserIds).toContain('u2');
  });

  it('normal 通知で latestKnowledge の KnowledgeID が notifEvent に保存される', async () => {
    mockDetectCritical.mockResolvedValue({ isCritical: false });
    mockShouldNotifyNow.mockReturnValue({
      notify: true,
      kind: 'normal',
      toneBucket: 'normal',
      elapsedMs: DAY,
    });
    mockSendWebPush.mockResolvedValue(true);

    const notifEventRepo = makeNotifEventRepo();
    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    await notifyAllUsers(makeParams({ notifEventRepo: notifEventRepo as never }));

    expect(notifEventRepo.put).toHaveBeenCalledWith(expect.objectContaining({ KnowledgeID: 'k1' }));
  });

  describe('Phase 2: ネタ使い回し抑制', () => {
    it('直近通知で使用済みの KnowledgeID を避けて未使用の Knowledge が選ばれる', async () => {
      // k1 は使用済み、k2 は未使用 → k2 が選ばれること
      const knowledgeRepo = {
        list: jest.fn().mockResolvedValue([
          { KnowledgeID: 'k1', Topic: 'TypeScript' },
          { KnowledgeID: 'k2', Topic: 'React' },
        ]),
      };
      // 直近 60 件の通知イベントに k1 が含まれる
      const notifEventRepo = {
        listByUser: jest
          .fn()
          .mockResolvedValue([{ KnowledgeID: 'k1', Kind: 'normal', CreatedAt: Date.now() - DAY }]),
        put: jest.fn().mockResolvedValue({}),
      };

      mockDetectCritical.mockResolvedValue({ isCritical: false });
      mockShouldNotifyNow.mockReturnValue({
        notify: true,
        kind: 'normal',
        toneBucket: 'normal',
        elapsedMs: DAY,
      });
      mockSendWebPush.mockResolvedValue(true);

      const buildNotificationMessage = core.buildNotificationMessage as jest.Mock;

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(
        makeParams({
          knowledgeRepo: knowledgeRepo as never,
          notifEventRepo: notifEventRepo as never,
        })
      );

      // buildNotificationMessage の呼び出し引数を確認（k2 の Topic が渡されること）
      expect(buildNotificationMessage).toHaveBeenCalledWith(
        expect.objectContaining({ knowledgeTopic: 'React' }),
        expect.any(Number)
      );
      // 保存される KnowledgeID も k2
      expect(notifEventRepo.put).toHaveBeenCalledWith(
        expect.objectContaining({ KnowledgeID: 'k2' })
      );
    });

    it('全 Knowledge が使用済みの場合は先頭（recentKnowledge[0]）にフォールバックする', async () => {
      // k1, k2 どちらも使用済み → k1（先頭）にフォールバック
      const knowledgeRepo = {
        list: jest.fn().mockResolvedValue([
          { KnowledgeID: 'k1', Topic: 'TypeScript' },
          { KnowledgeID: 'k2', Topic: 'React' },
        ]),
      };
      const notifEventRepo = {
        listByUser: jest.fn().mockResolvedValue([
          { KnowledgeID: 'k1', Kind: 'normal', CreatedAt: Date.now() - DAY },
          { KnowledgeID: 'k2', Kind: 'normal', CreatedAt: Date.now() - 2 * DAY },
        ]),
        put: jest.fn().mockResolvedValue({}),
      };

      mockDetectCritical.mockResolvedValue({ isCritical: false });
      mockShouldNotifyNow.mockReturnValue({
        notify: true,
        kind: 'normal',
        toneBucket: 'normal',
        elapsedMs: DAY,
      });
      mockSendWebPush.mockResolvedValue(true);

      const buildNotificationMessage = core.buildNotificationMessage as jest.Mock;

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(
        makeParams({
          knowledgeRepo: knowledgeRepo as never,
          notifEventRepo: notifEventRepo as never,
        })
      );

      // フォールバック → k1（先頭）の Topic が渡される
      expect(buildNotificationMessage).toHaveBeenCalledWith(
        expect.objectContaining({ knowledgeTopic: 'TypeScript' }),
        expect.any(Number)
      );
      expect(notifEventRepo.put).toHaveBeenCalledWith(
        expect.objectContaining({ KnowledgeID: 'k1' })
      );
    });

    it('クリティカル通知の content 選択はネタ抑制に影響されない', async () => {
      // critical は知識が決まっているので recentKnowledge の先頭をそのまま使う
      const knowledgeRepo = {
        list: jest.fn().mockResolvedValue([
          { KnowledgeID: 'k1', Topic: 'TypeScript' },
          { KnowledgeID: 'k2', Topic: 'React' },
        ]),
      };
      // k1 は使用済みだが critical は影響を受けない
      const notifEventRepo = {
        listByUser: jest
          .fn()
          .mockResolvedValue([{ KnowledgeID: 'k1', Kind: 'normal', CreatedAt: Date.now() - DAY }]),
        put: jest.fn().mockResolvedValue({}),
      };

      mockDetectCritical.mockResolvedValue({ isCritical: true, knowledgeId: 'k1' });
      mockShouldNotifyNow.mockReturnValue({ notify: true, kind: 'critical', knowledgeId: 'k1' });
      mockSendWebPush.mockResolvedValue(true);

      const buildCriticalNotificationMessage = core.buildCriticalNotificationMessage as jest.Mock;

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(
        makeParams({
          knowledgeRepo: knowledgeRepo as never,
          notifEventRepo: notifEventRepo as never,
        })
      );

      // critical は buildCriticalNotificationMessage が呼ばれる
      expect(buildCriticalNotificationMessage).toHaveBeenCalledWith('TypeScript');
    });
  });

  it('DynamoDB scan がページネーション → 全ユーザーを収集する', async () => {
    const docClient = {
      send: jest
        .fn()
        .mockResolvedValueOnce({
          Items: [{ UserID: 'u1' }],
          LastEvaluatedKey: { pk: 'USER#u1' },
        })
        .mockResolvedValueOnce({
          Items: [{ UserID: 'u2' }],
        }),
    };
    mockDetectCritical.mockResolvedValue({ isCritical: false });
    mockShouldNotifyNow.mockReturnValue({ notify: false, reason: 'not_due' });

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(makeParams({ docClient: docClient as never }));

    expect(result.skippedUsers + result.failedUsers + result.notifiedUsers).toBe(2);
  });
});

const DAY = 24 * 60 * 60 * 1000;
