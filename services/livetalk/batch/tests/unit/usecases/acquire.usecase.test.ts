jest.mock('@nagiyu/livetalk-core', () => ({
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
          Bedtime: '01:30',
          WakeUpTime: '09:30',
          UserID: userId,
          CharacterID: characterId,
          CreatedAt: 0,
          UpdatedAt: 0,
        });
      }),
  });

  const makeParams = (overrides = {}) => ({
    profileRepo: makeProfileRepo(['u1', 'u2']) as never,
    lifecycleRepo: makeLifecycleRepo() as never,
    topicRepo: {} as never,
    webRawRepo: {} as never,
    studyTopicRepo: {} as never,
    researchClient: {} as never,
    changeDetector: {} as never,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllCharacterIds.mockReturnValue(['hiyori', 'ageha']);
  });

  it('全ユーザー全キャラをループして acquireForUser を呼ぶ', async () => {
    mockAcquireForUser.mockResolvedValue({
      outcome: 'acquired',
      requestsProcessed: 1,
      staleRefreshed: 0,
      staleChanged: 0,
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

  it('acquireForUser がスキップを返したキャラはユーザー単位の processed に加算しない', async () => {
    mockAcquireForUser
      .mockResolvedValueOnce({
        outcome: 'acquired',
        requestsProcessed: 1,
        staleRefreshed: 0,
        staleChanged: 0,
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
        selfStudied: 0,
        webRawWritten: 1,
      }) // u1 ageha
      .mockResolvedValueOnce({
        outcome: 'acquired',
        requestsProcessed: 1,
        staleRefreshed: 0,
        staleChanged: 0,
        selfStudied: 0,
        webRawWritten: 1,
      }) // u2 hiyori
      .mockResolvedValueOnce({
        outcome: 'acquired',
        requestsProcessed: 1,
        staleRefreshed: 0,
        staleChanged: 0,
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
      selfStudied: 1,
      webRawWritten: 3,
    });

    const { acquireAllUsers } = await import('../../../src/usecases/acquire.usecase.js');
    const result = await acquireAllUsers(makeParams());

    // 4 回分の合算
    expect(result.requestsProcessed).toBe(4);
    expect(result.staleRefreshed).toBe(8);
    expect(result.staleChanged).toBe(4);
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
