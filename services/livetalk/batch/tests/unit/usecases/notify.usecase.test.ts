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

/**
 * @nagiyu/livetalk-core モック。
 * Phase B では getAllCharacterIds・selectNotificationsToSend・
 * computeIntensityFactor・computeDailyNormalCap・extractSessionStartTimes が追加。
 */
jest.mock('@nagiyu/livetalk-core', () => ({
  DEFAULT_CHARACTER_ID: 'hiyori',
  buildNotificationMessage: jest.fn(() => ({ title: 'テスト', body: '本文' })),
  buildCriticalNotificationMessage: jest.fn(() => ({ title: 'テスト（重要）', body: '重要本文' })),
  detectCriticalKnowledge: jest.fn(),
  shouldNotifyNow: jest.fn(),
  getAllCharacterIds: jest.fn(() => ['hiyori']),
  getCharacterDefinitionById: jest.fn((id: string) => ({
    id,
    displayName: id === 'hiyori' ? '桃瀬ひより' : 'アゲハ',
    notificationName: id === 'hiyori' ? 'ひより' : 'アゲハ',
  })),
  selectNotificationsToSend: jest.fn(),
  computeIntensityFactor: jest.fn(() => 1),
  computeDailyNormalCap: jest.fn(() => 1),
  extractSessionStartTimes: jest.fn(() => []),
  defaultUlidFactory: jest.fn(() => 'ULID-0001'),
  NOTIFICATION_EVENT_TTL_SECONDS: 2592000,
  NOTIFY_INTENSITY_WINDOW_DAYS: 7,
  NOTIFY_SESSION_GAP_MINUTES: 60,
  DynamoDBInterestRepository: jest.fn(),
  OpenAIEmbeddingClient: jest.fn(),
}));

const mockSendWebPush = jest.requireMock('@nagiyu/common/push')
  .sendWebPushNotification as jest.Mock;
const core = jest.requireMock('@nagiyu/livetalk-core');
const mockDetectCritical = core.detectCriticalKnowledge as jest.Mock;
const mockShouldNotifyNow = core.shouldNotifyNow as jest.Mock;
const mockGetAllCharacterIds = core.getAllCharacterIds as jest.Mock;
const mockSelectNotificationsToSend = core.selectNotificationsToSend as jest.Mock;

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

function makeMessageRepo(messages = [{ Role: 'user', CreatedAt: 1000 }]) {
  return {
    listSince: jest.fn().mockResolvedValue(messages),
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
    // デフォルト: 1 キャラ（hiyori）のみ走査
    mockGetAllCharacterIds.mockReturnValue(['hiyori']);
    // デフォルト: hiyori の normal 発火を選抜
    mockSelectNotificationsToSend.mockReturnValue({
      criticalCharacterIds: [],
      normalCharacterId: 'hiyori',
    });
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
    // 全キャラが発火しないので normalCharacterId=null にする
    mockSelectNotificationsToSend.mockReturnValue({
      criticalCharacterIds: [],
      normalCharacterId: null,
    });

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(makeParams());

    expect(result.notifiedUsers).toBe(0);
    expect(result.skippedUsers).toBe(1);
  });

  it('lifecycle が null のキャラはスキップ', async () => {
    const lifecycleRepo = { get: jest.fn().mockResolvedValue(null) };
    mockDetectCritical.mockResolvedValue({ isCritical: false });
    // 全キャラがスキップされる（候補なし）
    mockSelectNotificationsToSend.mockReturnValue({
      criticalCharacterIds: [],
      normalCharacterId: null,
    });

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
    mockSelectNotificationsToSend.mockReturnValue({
      criticalCharacterIds: ['hiyori'],
      normalCharacterId: null,
    });
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
    // pushSubscriptionRepo が throw → processUser 全体が例外
    const pushSubscriptionRepo = {
      listByUser: jest.fn().mockRejectedValue(new Error('DynamoDB エラー')),
      delete: jest.fn(),
    };

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(
      makeParams({
        docClient: docClient as never,
        pushSubscriptionRepo: pushSubscriptionRepo as never,
      })
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

  describe('Phase B: 全キャラ走査', () => {
    it('複数キャラに lifecycle あり → 各キャラ独立判定が走る', async () => {
      // 2 キャラ（hiyori, ageha）を走査
      mockGetAllCharacterIds.mockReturnValue(['hiyori', 'ageha']);
      mockDetectCritical.mockResolvedValue({ isCritical: false });
      mockShouldNotifyNow.mockReturnValue({
        notify: true,
        kind: 'normal',
        toneBucket: 'normal',
        elapsedMs: DAY,
      });
      // ageha を選抜
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: [],
        normalCharacterId: 'ageha',
      });
      mockSendWebPush.mockResolvedValue(true);

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(makeParams());

      // shouldNotifyNow が 2 回（hiyori と ageha それぞれ）呼ばれる
      expect(mockShouldNotifyNow).toHaveBeenCalledTimes(2);
    });

    it('2 キャラとも normal 発火資格 → 調停で 1 体だけ選抜されて put/push される', async () => {
      mockGetAllCharacterIds.mockReturnValue(['hiyori', 'ageha']);
      mockDetectCritical.mockResolvedValue({ isCritical: false });
      mockShouldNotifyNow.mockReturnValue({
        notify: true,
        kind: 'normal',
        toneBucket: 'normal',
        elapsedMs: DAY,
      });
      // 調停結果: ageha のみ選抜
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: [],
        normalCharacterId: 'ageha',
      });
      mockSendWebPush.mockResolvedValue(true);

      const notifEventRepo = makeNotifEventRepo();
      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(makeParams({ notifEventRepo: notifEventRepo as never }));

      // put は 1 回（ageha 分のみ）
      expect(notifEventRepo.put).toHaveBeenCalledTimes(1);
      expect(notifEventRepo.put).toHaveBeenCalledWith(
        expect.objectContaining({ CharacterID: 'ageha' })
      );
      // push も 1 回
      expect(mockSendWebPush).toHaveBeenCalledTimes(1);
    });

    it('critical は複数キャラで独立に送られる', async () => {
      mockGetAllCharacterIds.mockReturnValue(['hiyori', 'ageha']);
      mockDetectCritical.mockResolvedValue({ isCritical: true, knowledgeId: 'k1' });
      mockShouldNotifyNow.mockReturnValue({
        notify: true,
        kind: 'critical',
        knowledgeId: 'k1',
      });
      // hiyori と ageha 両方 critical で送る
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: ['hiyori', 'ageha'],
        normalCharacterId: null,
      });
      mockSendWebPush.mockResolvedValue(true);

      const notifEventRepo = makeNotifEventRepo();
      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(makeParams({ notifEventRepo: notifEventRepo as never }));

      // 2 キャラ分の put が呼ばれる
      expect(notifEventRepo.put).toHaveBeenCalledTimes(2);
      expect(notifEventRepo.put).toHaveBeenCalledWith(
        expect.objectContaining({ CharacterID: 'hiyori' })
      );
      expect(notifEventRepo.put).toHaveBeenCalledWith(
        expect.objectContaining({ CharacterID: 'ageha' })
      );
    });

    it('lifecycle 無しキャラはスキップ', async () => {
      mockGetAllCharacterIds.mockReturnValue(['hiyori', 'ageha']);
      const lifecycleRepo = {
        // hiyori のみ lifecycle あり、ageha はなし
        get: jest.fn().mockImplementation(({ characterId }: { characterId: string }) => {
          if (characterId === 'hiyori') {
            return Promise.resolve({
              UserID: 'u1',
              CharacterID: 'hiyori',
              Bedtime: '01:30',
              WakeUpTime: '09:30',
              CreatedAt: 0,
              UpdatedAt: 0,
            });
          }
          return Promise.resolve(null);
        }),
      };

      mockDetectCritical.mockResolvedValue({ isCritical: false });
      mockShouldNotifyNow.mockReturnValue({
        notify: true,
        kind: 'normal',
        toneBucket: 'normal',
        elapsedMs: DAY,
      });
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: [],
        normalCharacterId: 'hiyori',
      });
      mockSendWebPush.mockResolvedValue(true);

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(makeParams({ lifecycleRepo: lifecycleRepo as never }));

      // shouldNotifyNow は hiyori のみ（1 回）
      expect(mockShouldNotifyNow).toHaveBeenCalledTimes(1);
    });

    it('キャラ単位の履歴フィルタが効く（他キャラの通知が interval/cap に影響しない）', async () => {
      mockGetAllCharacterIds.mockReturnValue(['hiyori', 'ageha']);
      mockDetectCritical.mockResolvedValue({ isCritical: false });

      // shouldNotifyNow に渡される notificationEvents を捕捉
      const capturedEventsByCharacter: Record<string, unknown[]> = {};
      mockShouldNotifyNow.mockImplementation(
        (input: {
          notificationEvents: unknown[];
          lifecycle: { CharacterID?: string };
          [key: string]: unknown;
        }) => {
          const charId = input.lifecycle?.CharacterID ?? 'unknown';
          capturedEventsByCharacter[charId] = input.notificationEvents;
          return { notify: false, reason: 'not_due' };
        }
      );
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: [],
        normalCharacterId: null,
      });

      // hiyori と ageha 両方の通知イベントをリポジトリが返す
      const notifEventRepo = {
        listByUser: jest.fn().mockResolvedValue([
          {
            UserID: 'u1',
            NotifID: 'n1',
            CharacterID: 'hiyori',
            Kind: 'normal',
            Title: 'x',
            Body: 'x',
            CreatedAt: Date.now() - DAY,
            Ttl: 0,
          },
          {
            UserID: 'u1',
            NotifID: 'n2',
            CharacterID: 'ageha',
            Kind: 'normal',
            Title: 'x',
            Body: 'x',
            CreatedAt: Date.now() - 2 * DAY,
            Ttl: 0,
          },
        ]),
        put: jest.fn().mockResolvedValue({}),
      };

      const lifecycleRepo = {
        get: jest.fn().mockImplementation(({ characterId }: { characterId: string }) => {
          return Promise.resolve({
            UserID: 'u1',
            CharacterID: characterId,
            Bedtime: '01:30',
            WakeUpTime: '09:30',
            CreatedAt: 0,
            UpdatedAt: 0,
          });
        }),
      };

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(
        makeParams({
          notifEventRepo: notifEventRepo as never,
          lifecycleRepo: lifecycleRepo as never,
        })
      );

      // hiyori には hiyori の通知のみ（1 件）が渡される
      const hiyoriEvents = capturedEventsByCharacter['hiyori'];
      expect(hiyoriEvents).toBeDefined();
      if (hiyoriEvents) {
        expect(
          hiyoriEvents.every((e) => (e as { CharacterID: string }).CharacterID === 'hiyori')
        ).toBe(true);
        expect(hiyoriEvents).toHaveLength(1);
      }
    });
  });

  describe('Phase B: push payload に characterId', () => {
    it('送信 payload に data.characterId と data.url が含まれる', async () => {
      mockDetectCritical.mockResolvedValue({ isCritical: false });
      mockShouldNotifyNow.mockReturnValue({
        notify: true,
        kind: 'normal',
        toneBucket: 'normal',
        elapsedMs: DAY,
      });
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: [],
        normalCharacterId: 'hiyori',
      });
      mockSendWebPush.mockResolvedValue(true);

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(makeParams());

      // sendWebPushNotification の第 2 引数（payload）を確認
      const payloadArg = mockSendWebPush.mock.calls[0][1];
      expect(payloadArg.data).toMatchObject({
        characterId: 'hiyori',
        url: '/?character=hiyori',
      });
    });

    it('notifEvent の put に CharacterID が含まれる', async () => {
      mockDetectCritical.mockResolvedValue({ isCritical: false });
      mockShouldNotifyNow.mockReturnValue({
        notify: true,
        kind: 'normal',
        toneBucket: 'normal',
        elapsedMs: DAY,
      });
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: [],
        normalCharacterId: 'hiyori',
      });
      mockSendWebPush.mockResolvedValue(true);

      const notifEventRepo = makeNotifEventRepo();
      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(makeParams({ notifEventRepo: notifEventRepo as never }));

      expect(notifEventRepo.put).toHaveBeenCalledWith(
        expect.objectContaining({ CharacterID: 'hiyori' })
      );
    });
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
      // 直近 60 件の通知イベントに k1 が含まれる（hiyori の履歴として）
      const notifEventRepo = {
        listByUser: jest.fn().mockResolvedValue([
          {
            KnowledgeID: 'k1',
            Kind: 'normal',
            CharacterID: 'hiyori',
            CreatedAt: Date.now() - DAY,
            UserID: 'u1',
            NotifID: 'n1',
            Title: 'x',
            Body: 'x',
            Ttl: 0,
          },
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
          {
            KnowledgeID: 'k1',
            Kind: 'normal',
            CharacterID: 'hiyori',
            CreatedAt: Date.now() - DAY,
            UserID: 'u1',
            NotifID: 'n1',
            Title: 'x',
            Body: 'x',
            Ttl: 0,
          },
          {
            KnowledgeID: 'k2',
            Kind: 'normal',
            CharacterID: 'hiyori',
            CreatedAt: Date.now() - 2 * DAY,
            UserID: 'u1',
            NotifID: 'n2',
            Title: 'x',
            Body: 'x',
            Ttl: 0,
          },
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
        listByUser: jest.fn().mockResolvedValue([
          {
            KnowledgeID: 'k1',
            Kind: 'normal',
            CharacterID: 'hiyori',
            CreatedAt: Date.now() - DAY,
            UserID: 'u1',
            NotifID: 'n1',
            Title: 'x',
            Body: 'x',
            Ttl: 0,
          },
        ]),
        put: jest.fn().mockResolvedValue({}),
      };

      mockDetectCritical.mockResolvedValue({ isCritical: true, knowledgeId: 'k1' });
      mockShouldNotifyNow.mockReturnValue({ notify: true, kind: 'critical', knowledgeId: 'k1' });
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: ['hiyori'],
        normalCharacterId: null,
      });
      mockSendWebPush.mockResolvedValue(true);

      const buildCriticalNotificationMessage = core.buildCriticalNotificationMessage as jest.Mock;

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(
        makeParams({
          knowledgeRepo: knowledgeRepo as never,
          notifEventRepo: notifEventRepo as never,
        })
      );

      // critical は buildCriticalNotificationMessage が呼ばれ、knowledgeId=k1 の Topic（TypeScript）が渡される
      expect(buildCriticalNotificationMessage).toHaveBeenCalledWith(
        'TypeScript',
        expect.any(String)
      );
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
    mockSelectNotificationsToSend.mockReturnValue({
      criticalCharacterIds: [],
      normalCharacterId: null,
    });

    const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
    const result = await notifyAllUsers(makeParams({ docClient: docClient as never }));

    expect(result.skippedUsers + result.failedUsers + result.notifiedUsers).toBe(2);
  });

  describe('Phase 2 チューニング: 強度サンプリング時刻範囲ベース切り替え', () => {
    it('listSince が sinceMs ≒ now - 7日 で呼ばれること', async () => {
      // now を固定して sinceMs の計算を検証する
      const fixedNow = new Date('2026-06-07T10:00:00.000Z');
      const expectedWindowMs = 7 * 24 * 60 * 60 * 1000;
      const expectedSinceMs = fixedNow.getTime() - expectedWindowMs;

      mockDetectCritical.mockResolvedValue({ isCritical: false });
      mockShouldNotifyNow.mockReturnValue({ notify: false, reason: 'not_due' });
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: [],
        normalCharacterId: null,
      });

      const messageRepo = makeMessageRepo();

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      await notifyAllUsers(
        makeParams({
          messageRepo: messageRepo as never,
          now: () => fixedNow,
        })
      );

      // listSince が userId・characterId・期待する sinceMs で呼ばれていること
      // （hiyori 分：発火判定用 + computeUserDailyNormalCap 用の 2 回呼ばれる）
      expect(messageRepo.listSince).toHaveBeenCalledWith('u1', 'hiyori', expectedSinceMs);
    });

    it('長期不在ユーザー: listSince が空配列を返してもクラッシュせずスキップされる', async () => {
      // 直近7日にメッセージなし（長期不在ユーザー）
      const messageRepo = makeMessageRepo([]);

      mockDetectCritical.mockResolvedValue({ isCritical: false });
      // userMessages が空の場合、shouldNotifyNow は not_due か inactive_stopped を返す想定
      mockShouldNotifyNow.mockReturnValue({ notify: false, reason: 'not_due' });
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: [],
        normalCharacterId: null,
      });

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      let error: unknown;
      let result: { skippedUsers: number } | undefined;
      try {
        result = await notifyAllUsers(makeParams({ messageRepo: messageRepo as never }));
      } catch (e) {
        error = e;
      }

      // 例外なく完了すること
      expect(error).toBeUndefined();
      // スキップ扱いになること
      expect(result?.skippedUsers).toBe(1);
    });

    it('長期不在ユーザー: listSince が空でも failedUsers に計上されない', async () => {
      const messageRepo = makeMessageRepo([]);

      mockDetectCritical.mockResolvedValue({ isCritical: false });
      mockShouldNotifyNow.mockReturnValue({ notify: false, reason: 'inactive_stopped' });
      mockSelectNotificationsToSend.mockReturnValue({
        criticalCharacterIds: [],
        normalCharacterId: null,
      });

      const { notifyAllUsers } = await import('../../../src/usecases/notify.usecase.js');
      const result = await notifyAllUsers(makeParams({ messageRepo: messageRepo as never }));

      expect(result.failedUsers).toBe(0);
      expect(result.skippedUsers).toBe(1);
    });
  });
});

const DAY = 24 * 60 * 60 * 1000;
