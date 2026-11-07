import { InMemorySingleTableStore } from '@nagiyu/aws';
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
          model: 'gpt-4o-mini-tts',
          voice: 'nova',
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
  const makeProfileRepo = (userIds: string[]) => ({
    listAllUserIds: jest.fn().mockResolvedValue(userIds),
    getById: jest.fn(),
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

  const makeParams = (overrides = {}) => ({
    profileRepo: makeProfileRepo(['u1', 'u2']) as never,
    lifecycleRepo: makeLifecycleRepo() as never,
    messageRepo: makeMessageRepo() as never,
    studyUsageRepo,
    now: () => new Date(NOW_MS),
    topicRepo: {} as never,
    webRawRepo: {} as never,
    studyTopicRepo: {} as never,
    researchClient: {} as never,
    changeDetector: {} as never,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    studyUsageRepo = new InMemoryStudyUsageRepository(new InMemorySingleTableStore());
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
    });

    const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
    const result = await acquireAllUsers(makeParams());

    // u1, u2 × hiyori, ageha = 4 回
    expect(mockAcquireForUser).toHaveBeenCalledTimes(4);
    expect(result.processedUsers).toBe(2);
    expect(result.skippedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
    expect(result.webRawWritten).toBe(4);
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

    it('カウンターの障害: 止めた組を集計し、ユーザーの失敗にはしない', async () => {
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
      expect(result.failedUsers).toBe(0);
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
});
