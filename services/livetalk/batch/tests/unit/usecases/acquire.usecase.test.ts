import { InMemoryAuthUserRoleSourceReader, InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryStudyUsageRepository } from '@nagiyu/livetalk-core';

jest.mock('@nagiyu/livetalk-core', () => ({
  // 停止判定・枠の配分・回数の記録は実物を使い、キャラクター定義と acquireForUser だけを差し替える
  ...jest.requireActual('@nagiyu/livetalk-core'),
  getAllCharacterIds: jest.fn(() => ['hiyori', 'ageha']),
  getCharacterDefinitionById: jest.fn((id: string) => {
    if (id === 'hiyori') {
      return {
        id: 'hiyori',
        displayName: '桃瀬ひより',
        notificationName: 'ひより',
        personality: {
          basePrompt: '',
          speechStyle: '優しい口調',
          preferences: { likes: [], dislikes: [] },
        },
        voiceConfig: { provider: 'voicevox' as const, speakerId: 14 },
        license: { displayText: '', creditName: '' },
      };
    }
    if (id === 'ageha') {
      return {
        id: 'ageha',
        displayName: '早瀬アゲハ',
        notificationName: 'アゲハ',
        personality: {
          basePrompt: '',
          speechStyle: '活発な口調',
          preferences: { likes: [], dislikes: [] },
        },
        voiceConfig: {
          provider: 'openai-tts' as const,
          model: 'gpt-realtime-2.1-mini',
          voice: 'marin',
          instructions: '',
        },
        license: { displayText: '', creditName: '' },
      };
    }
    return undefined;
  }),
  acquireForUser: jest.fn(),
}));

const mockGetAllCharacterIds = jest.requireMock('@nagiyu/livetalk-core')
  .getAllCharacterIds as jest.Mock;
const mockGetCharacterDefinitionById = jest.requireMock('@nagiyu/livetalk-core')
  .getCharacterDefinitionById as jest.Mock;
const mockAcquireForUser = jest.requireMock('@nagiyu/livetalk-core').acquireForUser as jest.Mock;

describe('acquireAllUsers', () => {
  /** 既定ではお試し中 (作成から 1 時間) の Profile を返す */
  const makeProfileRepo = (userIds: string[], createdAtByUser: Record<string, number> = {}) => ({
    listAllUserIds: jest.fn().mockResolvedValue(userIds),
    getById: jest.fn().mockImplementation(async ({ userId }: { userId: string }) => ({
      userId,
      createdAt: createdAtByUser[userId] ?? NOW_MS - HOUR_MS,
    })),
    upsert: jest.fn(),
  });

  const makeLifecycleRepo = (overrides: Record<string, object | null> = {}) => ({
    get: jest
      .fn()
      .mockImplementation(({ userId, characterId }: { userId: string; characterId: string }) => {
        const key = `${userId}:${characterId}`;
        if (key in overrides) return Promise.resolve(overrides[key]);
        return Promise.resolve({
          bedtime: '01:30',
          wakeUpTime: '09:30',
          userId,
          characterId,
          createdAt: 0,
          updatedAt: 0,
        });
      }),
  });

  const NOW_MS = Date.parse('2026-11-05T03:00:00Z');
  const HOUR_MS = 60 * 60 * 1000;
  const PAUSE_MS = 72 * HOUR_MS;

  /** 指定の時刻に利用者が最後に話した履歴を返すリポジトリ */
  const makeMessageRepo = (lastUserMessageAt: number | null = NOW_MS - HOUR_MS) => ({
    listSince: jest
      .fn()
      .mockResolvedValue(
        lastUserMessageAt === null ? [] : [{ role: 'user', createdAt: lastUserMessageAt }]
      ),
  });

  /** キャラクターごとに最後の発話時刻を変えるリポジトリ */
  const makeMessageRepoByCharacter = (byCharacter: Record<string, number | undefined>) => ({
    listSince: jest.fn().mockImplementation(async (_userId: string, characterId: string) => {
      const at = byCharacter[characterId];
      return at === undefined ? [] : [{ role: 'user', createdAt: at }];
    }),
  });

  let studyUsageRepo: InMemoryStudyUsageRepository;
  let authReader: InMemoryAuthUserRoleSourceReader;

  const makeParams = (overrides = {}) => ({
    profileRepo: makeProfileRepo(['u1', 'u2']) as never,
    authUserRoleSourceReader: authReader,
    lifecycleRepo: makeLifecycleRepo() as never,
    messageRepo: makeMessageRepo() as never,
    studyUsageRepo,
    now: () => new Date(NOW_MS),
    topicRepo: {} as never,
    webRawRepo: {} as never,
    studyTopicRepo: {} as never,
    freshnessCheckRequestRepo: {} as never,
    researchClient: {} as never,
    changeDetector: {} as never,
    angleGenerator: {} as never,
    explorationRepo: {} as never,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    studyUsageRepo = new InMemoryStudyUsageRepository(new InMemorySingleTableStore());
    authReader = new InMemoryAuthUserRoleSourceReader();
    mockGetAllCharacterIds.mockReturnValue(['hiyori', 'ageha']);
  });

  it('全ユーザー全キャラをループして acquireForUser を呼ぶ', async () => {
    mockAcquireForUser.mockResolvedValue({
      outcome: 'acquired',
      requestsProcessed: 1,
      staleRefreshed: 0,
      staleChanged: 0,
      staleFactsReviewed: 0,
      selfStudied: 0,
      webRawWritten: 1,
      webSearchCalls: 2,
    });

    const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
    const result = await acquireAllUsers(makeParams());

    // u1, u2 × hiyori, ageha = 4 回
    expect(mockAcquireForUser).toHaveBeenCalledTimes(4);
    // 角度の生成器と探索の記録は呼び出し側から acquireForUser へそのまま渡る
    const params = makeParams();
    expect(mockAcquireForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        angleGenerator: params.angleGenerator,
        explorationRepo: params.explorationRepo,
      })
    );
    expect(result.processedUsers).toBe(2);
    expect(result.skippedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
    expect(result.webRawWritten).toBe(4);
    expect(result.webSearchCalls).toBe(8);
  });

  describe('1 日の枠の配分', () => {
    /** acquireForUser の中で枠を使い切るまで問い合わせ、使えた回数を記録する */
    const drainAllowance = (used: Record<string, number>) =>
      mockAcquireForUser.mockImplementation(
        async (
          userId: string,
          characterId: string,
          params: { researchAllowance: { tryConsume: () => Promise<boolean> } }
        ) => {
          let count = 0;
          while (await params.researchAllowance.tryConsume()) count++;
          used[`${userId}:${characterId}`] = count;
          return {
            outcome: 'acquired',
            requestsProcessed: count,
            staleRefreshed: 0,
            staleChanged: 0,
            staleFactsReviewed: 0,
            selfStudied: 0,
            webRawWritten: 0,
            dailyLimitReached: true,
            counterFailed: false,
          };
        }
      );

    it('勉強中が 2 人: 上限を等分する', async () => {
      const used: Record<string, number> = {};
      drainAllowance(used);

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      const result = await acquireAllUsers(makeParams({ profileRepo: makeProfileRepo(['u1']) }));

      expect(used).toEqual({ 'u1:hiyori': 10, 'u1:ageha': 10 });
      expect(result.dailyLimitReachedCharacters).toBe(2);
      expect(result.counterFailedCharacters).toBe(0);
    });

    it('勉強中が 1 人: その 1 人が上限をすべて使う', async () => {
      const used: Record<string, number> = {};
      drainAllowance(used);
      const messageRepo = makeMessageRepoByCharacter({ hiyori: NOW_MS - HOUR_MS });

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      await acquireAllUsers(
        makeParams({ profileRepo: makeProfileRepo(['u1']), messageRepo: messageRepo as never })
      );

      expect(used).toEqual({ 'u1:hiyori': 20 });
    });

    it('止まっているキャラクターは配分に入らず、acquireForUser も呼ばれない', async () => {
      const used: Record<string, number> = {};
      drainAllowance(used);
      const messageRepo = makeMessageRepoByCharacter({
        hiyori: NOW_MS - HOUR_MS,
        // ちょうど 3 日で止まる
        ageha: NOW_MS - PAUSE_MS,
      });

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      await acquireAllUsers(
        makeParams({ profileRepo: makeProfileRepo(['u1']), messageRepo: messageRepo as never })
      );

      expect(used).toEqual({ 'u1:hiyori': 20 });
      expect(mockAcquireForUser).toHaveBeenCalledTimes(1);
    });

    it('発話が一度もないキャラクターも止まっている', async () => {
      const used: Record<string, number> = {};
      drainAllowance(used);
      const messageRepo = makeMessageRepoByCharacter({ hiyori: NOW_MS - HOUR_MS });

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      await acquireAllUsers(
        makeParams({ profileRepo: makeProfileRepo(['u1']), messageRepo: messageRepo as never })
      );

      expect(Object.keys(used)).toEqual(['u1:hiyori']);
    });

    it('lifecycle が無いキャラクターも配分に入らない', async () => {
      const used: Record<string, number> = {};
      drainAllowance(used);

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      await acquireAllUsers(
        makeParams({
          profileRepo: makeProfileRepo(['u1']),
          lifecycleRepo: makeLifecycleRepo({ 'u1:ageha': null }) as never,
        })
      );

      expect(used).toEqual({ 'u1:hiyori': 20 });
    });

    it('全員が止まっているユーザーは skipped で、履歴は停止判定のためだけに読む', async () => {
      const messageRepo = makeMessageRepo(null);

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      const result = await acquireAllUsers(
        makeParams({ profileRepo: makeProfileRepo(['u1']), messageRepo: messageRepo as never })
      );

      expect(mockAcquireForUser).not.toHaveBeenCalled();
      expect(result.skippedUsers).toBe(1);
      expect(messageRepo.listSince).toHaveBeenCalledTimes(2);
    });

    it('同じ日の 2 回目の実行では、使い切った枠は戻らない', async () => {
      const used: Record<string, number> = {};
      drainAllowance(used);
      const params = makeParams({ profileRepo: makeProfileRepo(['u1']) });

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      await acquireAllUsers(params);
      await acquireAllUsers(params);

      expect(used).toEqual({ 'u1:hiyori': 0, 'u1:ageha': 0 });
    });

    it('日付が変わると枠が戻る', async () => {
      const used: Record<string, number> = {};
      drainAllowance(used);
      const base = makeParams({ profileRepo: makeProfileRepo(['u1']) });

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      await acquireAllUsers(base);
      await acquireAllUsers({ ...base, now: () => new Date(NOW_MS + 24 * HOUR_MS) });

      expect(used).toEqual({ 'u1:hiyori': 10, 'u1:ageha': 10 });
    });

    it('カウンターの障害: 止めた組を集計し、ユーザーの失敗として計上する', async () => {
      mockAcquireForUser.mockResolvedValue({
        outcome: 'acquired',
        requestsProcessed: 0,
        staleRefreshed: 0,
        staleChanged: 0,
        staleFactsReviewed: 0,
        selfStudied: 0,
        webRawWritten: 0,
        dailyLimitReached: false,
        counterFailed: true,
      });

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      const result = await acquireAllUsers(makeParams({ profileRepo: makeProfileRepo(['u1']) }));

      expect(result.counterFailedCharacters).toBe(2);
      expect(result.dailyLimitReachedCharacters).toBe(0);
      expect(result.failedUsers).toBe(1);
      expect(result.failedUserIds).toEqual(['u1']);
    });

    it('履歴の取得に失敗したキャラクターは失敗として計上し、他キャラは継続する', async () => {
      const used: Record<string, number> = {};
      drainAllowance(used);
      const messageRepo = {
        listSince: jest.fn().mockImplementation(async (_userId: string, characterId: string) => {
          if (characterId === 'hiyori') throw new Error('履歴の取得失敗');
          return [{ role: 'user', createdAt: NOW_MS - HOUR_MS }];
        }),
      };

      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      const result = await acquireAllUsers(
        makeParams({ profileRepo: makeProfileRepo(['u1']), messageRepo: messageRepo as never })
      );

      expect(result.failedUserIds).toEqual(['u1']);
      expect(Object.keys(used)).toEqual(['u1:ageha']);
    });
  });

  it('acquireForUser がスキップを返したキャラはユーザー単位の processed に加算しない', async () => {
    mockAcquireForUser
      .mockResolvedValueOnce({
        outcome: 'acquired',
        requestsProcessed: 1,
        staleRefreshed: 0,
        staleChanged: 0,
        staleFactsReviewed: 0,
        selfStudied: 0,
        webRawWritten: 1,
      }) // u1 hiyori
      .mockResolvedValueOnce({ outcome: 'skipped', skipReason: 'テスト' }) // u1 ageha
      .mockResolvedValueOnce({ outcome: 'skipped', skipReason: 'テスト' }) // u2 hiyori
      .mockResolvedValueOnce({ outcome: 'skipped', skipReason: 'テスト' }); // u2 ageha

    const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
    const result = await acquireAllUsers(makeParams());

    expect(result.processedUsers).toBe(1);
    expect(result.skippedUsers).toBe(1);
  });

  it('lifecycle が null のキャラクターはスキップ（計上しない）', async () => {
    const lifecycleRepo = makeLifecycleRepo({
      'u1:hiyori': null,
      'u1:ageha': null,
      'u2:hiyori': null,
      'u2:ageha': null,
    });

    const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
    const result = await acquireAllUsers(makeParams({ lifecycleRepo: lifecycleRepo as never }));

    expect(result.skippedUsers).toBe(2);
    expect(mockAcquireForUser).not.toHaveBeenCalled();
  });

  it('acquireForUser が throw したキャラクターは failedUsers にカウント、他キャラは継続', async () => {
    mockAcquireForUser
      .mockRejectedValueOnce(new Error('hiyori エラー')) // u1 hiyori
      .mockResolvedValueOnce({
        outcome: 'acquired',
        requestsProcessed: 1,
        staleRefreshed: 0,
        staleChanged: 0,
        staleFactsReviewed: 0,
        selfStudied: 0,
        webRawWritten: 1,
      }) // u1 ageha
      .mockResolvedValueOnce({
        outcome: 'acquired',
        requestsProcessed: 1,
        staleRefreshed: 0,
        staleChanged: 0,
        staleFactsReviewed: 0,
        selfStudied: 0,
        webRawWritten: 1,
      }) // u2 hiyori
      .mockResolvedValueOnce({
        outcome: 'acquired',
        requestsProcessed: 1,
        staleRefreshed: 0,
        staleChanged: 0,
        staleFactsReviewed: 0,
        selfStudied: 0,
        webRawWritten: 1,
      }); // u2 ageha

    const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
    const result = await acquireAllUsers(makeParams());

    expect(result.failedUsers).toBe(1);
    expect(result.failedUserIds).toContain('u1');
    expect(result.processedUsers).toBe(1);
    expect(mockAcquireForUser).toHaveBeenCalledTimes(4);
  });

  it('acquireForUser の結果件数を集計する', async () => {
    mockAcquireForUser.mockResolvedValue({
      outcome: 'acquired',
      requestsProcessed: 1,
      staleRefreshed: 2,
      staleChanged: 1,
      staleFactsReviewed: 5,
      selfStudied: 1,
      webRawWritten: 3,
      webSearchCalls: 7,
    });

    const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
    const result = await acquireAllUsers(makeParams());

    // 4 回分の合算
    expect(result.requestsProcessed).toBe(4);
    expect(result.staleRefreshed).toBe(8);
    expect(result.staleChanged).toBe(4);
    expect(result.staleFactsReviewed).toBe(20);
    expect(result.selfStudied).toBe(4);
    expect(result.webRawWritten).toBe(12);
    expect(result.webSearchCalls).toBe(28);
  });

  it('getCharacterDefinitionById が undefined を返すキャラクターはスキップ', async () => {
    mockGetAllCharacterIds.mockReturnValue(['hiyori', 'unknown-char']);
    mockGetCharacterDefinitionById.mockImplementation((id: string) => {
      if (id === 'hiyori') {
        return {
          id: 'hiyori',
          displayName: '桃瀬ひより',
          notificationName: 'ひより',
          personality: {
            basePrompt: '',
            speechStyle: '',
            preferences: { likes: [], dislikes: [] },
          },
          voiceConfig: { provider: 'voicevox' as const, speakerId: 14 },
          license: { displayText: '', creditName: '' },
        };
      }
      return undefined;
    });
    mockAcquireForUser.mockResolvedValue({
      outcome: 'acquired',
      requestsProcessed: 0,
      staleRefreshed: 0,
      staleChanged: 0,
      staleFactsReviewed: 0,
      selfStudied: 0,
      webRawWritten: 0,
    });

    const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
    await acquireAllUsers(makeParams());

    expect(mockAcquireForUser).toHaveBeenCalledWith(expect.anything(), 'hiyori', expect.anything());
    expect(mockAcquireForUser).not.toHaveBeenCalledWith(
      expect.anything(),
      'unknown-char',
      expect.anything()
    );
  });

  describe('利用者の区分と 1 日の上限', () => {
    const DAY_MS = 24 * HOUR_MS;
    const acquired = {
      outcome: 'acquired',
      requestsProcessed: 0,
      staleRefreshed: 0,
      staleChanged: 0,
      staleFactsReviewed: 0,
      selfStudied: 0,
      webRawWritten: 0,
      dailyLimitReached: false,
      counterFailed: false,
    };

    /** 枠を使い切るまで問い合わせ、利用者ごとに使えた回数を記録する */
    const drainByUser = (used: Record<string, number>) =>
      mockAcquireForUser.mockImplementation(
        async (
          userId: string,
          characterId: string,
          params: { researchAllowance: { tryConsume: () => Promise<boolean> } }
        ) => {
          let count = 0;
          while (await params.researchAllowance.tryConsume()) count++;
          used[`${userId}:${characterId}`] = count;
          return acquired;
        }
      );

    const run = async (overrides = {}) => {
      const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
      return acquireAllUsers(makeParams(overrides));
    };

    it('運営者・スタンダード・お試し中は 20 回、お試しのあとは勉強しない', async () => {
      authReader.putItem({ userId: 'op', Roles: ['livetalk-operator'] });
      authReader.putItem({ userId: 'std', Roles: ['livetalk-standard'] });
      const used: Record<string, number> = {};
      drainByUser(used);
      mockGetAllCharacterIds.mockReturnValue(['hiyori']);

      const result = await run({
        profileRepo: makeProfileRepo(['op', 'std', 'trial', 'expired'], {
          // 運営者・スタンダードは期限を問わない
          op: NOW_MS - 30 * DAY_MS,
          std: NOW_MS - 30 * DAY_MS,
          trial: NOW_MS - 3 * DAY_MS,
          expired: NOW_MS - 30 * DAY_MS,
        }) as never,
        messageRepo: makeMessageRepo() as never,
      });

      expect(used).toEqual({ 'op:hiyori': 20, 'std:hiyori': 20, 'trial:hiyori': 20 });
      expect(result.tierUsers).toEqual({ operator: 1, standard: 1, freeTrial: 1, freeExpired: 1 });
      expect(result.trialExpiredUsers).toBe(1);
      expect(result.skippedUsers).toBe(1);
      expect(result.processedUsers).toBe(3);
    });

    it('運営者とスタンダードの両方を持つ利用者は運営者として数える', async () => {
      authReader.putItem({ userId: 'u1', Roles: ['livetalk-standard', 'livetalk-operator'] });

      const result = await run({ profileRepo: makeProfileRepo(['u1']) as never });

      expect(result.tierUsers).toEqual({ operator: 1, standard: 0, freeTrial: 0, freeExpired: 0 });
    });

    it('有効な権利のロールも区分に使い、期限切れの権利は使わない', async () => {
      const grant = (grantId: string, expiresAt: number) => ({
        grantId,
        roleId: 'livetalk-standard',
        source: 'manual',
        createdAt: 1,
        updatedAt: 1,
        expiresAt,
      });
      authReader.putItem({
        userId: 'active',
        Roles: [],
        RoleGrants: [grant('g1', NOW_MS + DAY_MS)],
      });
      authReader.putItem({ userId: 'lapsed', Roles: [], RoleGrants: [grant('g2', NOW_MS)] });

      const result = await run({
        profileRepo: makeProfileRepo(['active', 'lapsed'], {
          active: NOW_MS - 30 * DAY_MS,
          lapsed: NOW_MS - 30 * DAY_MS,
        }) as never,
      });

      expect(result.tierUsers).toEqual({ operator: 0, standard: 1, freeTrial: 0, freeExpired: 1 });
    });

    it('お試しはちょうど 7 日で終わる', async () => {
      const result = await run({
        profileRepo: makeProfileRepo(['edge', 'inside'], {
          edge: NOW_MS - 7 * DAY_MS,
          inside: NOW_MS - 7 * DAY_MS + 1,
        }) as never,
      });

      expect(result.tierUsers).toMatchObject({ freeTrial: 1, freeExpired: 1 });
    });

    it('auth にユーザーがいなければロールなし (無料) として扱う', async () => {
      const result = await run({ profileRepo: makeProfileRepo(['ghost']) as never });

      expect(result.tierUsers).toMatchObject({ freeTrial: 1 });
      expect(result.failedUsers).toBe(0);
    });

    it('上限 0 の利用者は、キャラクターの走査もカウンタも触らない', async () => {
      const messageRepo = makeMessageRepo();
      const lifecycleRepo = makeLifecycleRepo();
      const repoSpy = jest.spyOn(studyUsageRepo, 'tryConsume');

      const result = await run({
        profileRepo: makeProfileRepo(['expired'], { expired: NOW_MS - 30 * DAY_MS }) as never,
        messageRepo: messageRepo as never,
        lifecycleRepo: lifecycleRepo as never,
      });

      expect(lifecycleRepo.get).not.toHaveBeenCalled();
      expect(messageRepo.listSince).not.toHaveBeenCalled();
      expect(mockAcquireForUser).not.toHaveBeenCalled();
      expect(repoSpy).not.toHaveBeenCalled();
      expect(result.skippedUsers).toBe(1);
      expect(result.trialExpiredUsers).toBe(1);
    });

    it('auth の読み取りに失敗した利用者は勉強せず失敗として数え、他の利用者は続く', async () => {
      const used: Record<string, number> = {};
      drainByUser(used);
      mockGetAllCharacterIds.mockReturnValue(['hiyori']);
      const original = authReader.getRoleSources.bind(authReader);
      jest.spyOn(authReader, 'getRoleSources').mockImplementation(async (userId: string) => {
        if (userId === 'bad') throw new Error('auth の読み取り失敗');
        return original(userId);
      });

      const result = await run({ profileRepo: makeProfileRepo(['bad', 'good']) as never });

      expect(result.failedUsers).toBe(1);
      expect(result.failedUserIds).toEqual(['bad']);
      expect(used).toEqual({ 'good:hiyori': 20 });
      expect(result.tierUsers.freeTrial).toBe(1);
    });

    it('Profile の読み取りに失敗した利用者は勉強せず失敗として数え、他の利用者は続く', async () => {
      const used: Record<string, number> = {};
      drainByUser(used);
      mockGetAllCharacterIds.mockReturnValue(['hiyori']);
      const profileRepo = makeProfileRepo(['bad', 'good']);
      profileRepo.getById.mockImplementation(async ({ userId }: { userId: string }) => {
        if (userId === 'bad') throw new Error('Profile の読み取り失敗');
        return { userId, createdAt: NOW_MS };
      });

      const result = await run({ profileRepo: profileRepo as never });

      expect(result.failedUserIds).toEqual(['bad']);
      expect(used).toEqual({ 'good:hiyori': 20 });
    });

    it('お試しの判定に要る Profile がない無料の利用者は失敗として数える', async () => {
      const profileRepo = makeProfileRepo(['u1']);
      profileRepo.getById.mockResolvedValue(null);

      const result = await run({ profileRepo: profileRepo as never });

      expect(result.failedUserIds).toEqual(['u1']);
      expect(mockAcquireForUser).not.toHaveBeenCalled();
    });

    it('Profile がなくても、運営者は期限を見ずに勉強できる', async () => {
      authReader.putItem({ userId: 'u1', Roles: ['livetalk-operator'] });
      mockAcquireForUser.mockResolvedValue(acquired);
      const profileRepo = makeProfileRepo(['u1']);
      profileRepo.getById.mockResolvedValue(null);

      const result = await run({ profileRepo: profileRepo as never });

      expect(result.failedUsers).toBe(0);
      expect(mockAcquireForUser).toHaveBeenCalled();
    });

    it('全体の上限で断られたら、利用者とキャラクターの回数が戻る', async () => {
      const used: Record<string, number> = {};
      drainByUser(used);
      mockGetAllCharacterIds.mockReturnValue(['hiyori']);
      const store = new InMemorySingleTableStore();
      // 全体は 200 回のうち残り 3 回
      store.put({
        PK: 'GLOBAL#STUDYUSAGE',
        SK: 'STUDYUSAGE#20261105',
        Type: 'StudyUsage',
        'Count#total': 197,
      });

      await run({
        studyUsageRepo: new InMemoryStudyUsageRepository(store),
        profileRepo: makeProfileRepo(['u1', 'u2']) as never,
      });

      expect(used).toEqual({ 'u1:hiyori': 3, 'u2:hiyori': 0 });
      expect(store.get('GLOBAL#STUDYUSAGE', 'STUDYUSAGE#20261105')).toMatchObject({
        'Count#total': 200,
      });
      // 断られた u2 の分は戻っている
      expect(store.get('USER#u2', 'STUDYUSAGE#20261105')).toMatchObject({
        'Count#hiyori': 0,
        'Count#total': 0,
      });
    });
  });
});
