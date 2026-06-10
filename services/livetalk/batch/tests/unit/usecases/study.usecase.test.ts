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
        voiceConfig: { provider: 'openai-tts' as const, model: 'gpt-4o-mini-tts', voice: 'nova', instructions: '' },
        license: { displayText: '', creditName: '' },
      };
    }
    return undefined;
  }),
  studyForUser: jest.fn(),
  generateNotesForUser: jest.fn(),
}));

const mockGetAllCharacterIds = jest.requireMock('@nagiyu/livetalk-core').getAllCharacterIds as jest.Mock;
const mockGetCharacterDefinitionById = jest.requireMock('@nagiyu/livetalk-core').getCharacterDefinitionById as jest.Mock;
const mockStudyForUser = jest.requireMock('@nagiyu/livetalk-core').studyForUser as jest.Mock;
const mockGenerateNotesForUser = jest.requireMock('@nagiyu/livetalk-core')
  .generateNotesForUser as jest.Mock;

describe('studyAllUsers', () => {
  const mockDocClient = {
    send: jest.fn(),
  };

  const makeLifecycleRepo = (overrides: Record<string, object | null> = {}) => ({
    get: jest.fn().mockImplementation(({ userId, characterId }: { userId: string; characterId: string }) => {
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
    docClient: mockDocClient as never,
    tableName: 'test-table',
    lifecycleRepo: makeLifecycleRepo() as never,
    interestRepo: {} as never,
    knowledgeRepo: {} as never,
    researchClient: {} as never,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllCharacterIds.mockReturnValue(['hiyori', 'ageha']);
    mockDocClient.send.mockResolvedValue({
      Items: [{ UserID: 'u1' }, { UserID: 'u2' }],
    });
    mockGenerateNotesForUser.mockResolvedValue({ generatedCount: 0 });
  });

  it('全ユーザー全キャラをループして studyForUser を呼ぶ', async () => {
    mockStudyForUser.mockResolvedValue({ outcome: 'studied', savedCount: 1 });

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams());

    // u1, u2 × hiyori, ageha = 4 回
    expect(mockStudyForUser).toHaveBeenCalledTimes(4);
    expect(result.studiedUsers).toBe(2);
    expect(result.skippedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
  });

  it('studyForUser がスキップを返したキャラはユーザー単位の studied に加算しない', async () => {
    mockStudyForUser
      .mockResolvedValueOnce({ outcome: 'studied', savedCount: 1 }) // u1 hiyori
      .mockResolvedValueOnce({ outcome: 'skipped', skipReason: 'テスト' }) // u1 ageha
      .mockResolvedValueOnce({ outcome: 'skipped', skipReason: 'テスト' }) // u2 hiyori
      .mockResolvedValueOnce({ outcome: 'skipped', skipReason: 'テスト' }); // u2 ageha

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams());

    // u1 は 1 キャラ studied, u2 は全スキップ
    expect(result.studiedUsers).toBe(1);
    expect(result.skippedUsers).toBe(1);
  });

  it('lifecycle が null のキャラクターはスキップ（計上しない）', async () => {
    const lifecycleRepo = makeLifecycleRepo({
      'u1:hiyori': null,
      'u1:ageha': null,
      'u2:hiyori': null,
      'u2:ageha': null,
    });

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams({ lifecycleRepo: lifecycleRepo as never }));

    // 全キャラ lifecycle なし → skippedUsers
    expect(result.skippedUsers).toBe(2);
    expect(mockStudyForUser).not.toHaveBeenCalled();
  });

  it('一部キャラのみ lifecycle 登録（hiyori あり、ageha なし）の場合、hiyori のみ処理', async () => {
    const lifecycleRepo = makeLifecycleRepo({
      'u1:ageha': null,
      'u2:ageha': null,
    });
    mockStudyForUser.mockResolvedValue({ outcome: 'studied', savedCount: 1 });

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams({ lifecycleRepo: lifecycleRepo as never }));

    // hiyori のみ処理（u1, u2 各 1 回 = 2 回）
    expect(mockStudyForUser).toHaveBeenCalledTimes(2);
    expect(mockStudyForUser).toHaveBeenCalledWith('u1', 'hiyori', expect.anything());
    expect(mockStudyForUser).not.toHaveBeenCalledWith(expect.anything(), 'ageha', expect.anything());
    expect(result.studiedUsers).toBe(2);
  });

  it('studyForUser が throw したキャラクターは failedUsers にカウント、他キャラは継続', async () => {
    mockStudyForUser
      .mockRejectedValueOnce(new Error('hiyori エラー')) // u1 hiyori
      .mockResolvedValueOnce({ outcome: 'studied', savedCount: 1 }) // u1 ageha
      .mockResolvedValueOnce({ outcome: 'studied', savedCount: 1 }) // u2 hiyori
      .mockResolvedValueOnce({ outcome: 'studied', savedCount: 1 }); // u2 ageha

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams());

    // u1 はキャラエラーがあるので failed
    expect(result.failedUsers).toBe(1);
    expect(result.failedUserIds).toContain('u1');
    // u2 は studied
    expect(result.studiedUsers).toBe(1);
    // 全 4 回呼ばれること（エラーしても他キャラ継続）
    expect(mockStudyForUser).toHaveBeenCalledTimes(4);
  });

  it('studyTopicRepo を studyForUser に受け渡す（Phase 5b 配線）', async () => {
    mockStudyForUser.mockResolvedValue({ outcome: 'studied', savedCount: 1 });
    const studyTopicRepo = { listByStatus: jest.fn() };

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    await studyAllUsers(makeParams({ studyTopicRepo: studyTopicRepo as never }));

    expect(mockStudyForUser).toHaveBeenCalledWith(
      'u1',
      'hiyori',
      expect.objectContaining({ studyTopicRepo })
    );
  });

  it('studyForUser に character として getCharacterDefinitionById の結果が渡される', async () => {
    mockStudyForUser.mockResolvedValue({ outcome: 'studied', savedCount: 1 });

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    await studyAllUsers(makeParams());

    expect(mockStudyForUser).toHaveBeenCalledWith(
      'u1',
      'hiyori',
      expect.objectContaining({
        character: expect.objectContaining({ id: 'hiyori', displayName: '桃瀬ひより' }),
      })
    );
    expect(mockStudyForUser).toHaveBeenCalledWith(
      'u1',
      'ageha',
      expect.objectContaining({
        character: expect.objectContaining({ id: 'ageha', displayName: '早瀬アゲハ' }),
      })
    );
  });

  it('noteRepo 指定時、studied キャラについてノート生成を行い件数を集計する（Phase 5c）', async () => {
    mockStudyForUser.mockResolvedValue({ outcome: 'studied', savedCount: 1 });
    mockGenerateNotesForUser.mockResolvedValue({ generatedCount: 2 });
    const noteRepo = { put: jest.fn(), list: jest.fn(), get: jest.fn(), listRecent: jest.fn() };

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams({ noteRepo: noteRepo as never }));

    // u1 hiyori, u1 ageha, u2 hiyori, u2 ageha の 4 キャラ × 2 件 = 8 件
    expect(result.generatedNotes).toBe(8);
    expect(mockGenerateNotesForUser).toHaveBeenCalledTimes(4);
    expect(mockGenerateNotesForUser).toHaveBeenCalledWith(
      'u1',
      'hiyori',
      expect.objectContaining({ noteRepo })
    );
    expect(mockGenerateNotesForUser).toHaveBeenCalledWith(
      'u1',
      'ageha',
      expect.objectContaining({ noteRepo })
    );
  });

  it('スキップしたキャラにはノート生成を行わない（Phase 5c）', async () => {
    mockStudyForUser.mockResolvedValue({ outcome: 'skipped', skipReason: 'テスト' });
    const noteRepo = { put: jest.fn(), list: jest.fn(), get: jest.fn(), listRecent: jest.fn() };

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams({ noteRepo: noteRepo as never }));

    expect(result.generatedNotes).toBe(0);
    expect(mockGenerateNotesForUser).not.toHaveBeenCalled();
  });

  it('ノート生成が失敗してもバッチは継続する（Phase 5c / fail-warn）', async () => {
    mockStudyForUser.mockResolvedValue({ outcome: 'studied', savedCount: 1 });
    mockGenerateNotesForUser.mockRejectedValue(new Error('note エラー'));
    const noteRepo = { put: jest.fn(), list: jest.fn(), get: jest.fn(), listRecent: jest.fn() };

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams({ noteRepo: noteRepo as never }));

    expect(result.studiedUsers).toBe(2);
    expect(result.generatedNotes).toBe(0);
    expect(result.failedUsers).toBe(0);
  });

  it('全キャラ lifecycle なし（skipped）より failed が優先される', async () => {
    // u1: hiyori はエラー、ageha は lifecycle なし
    const lifecycleRepo = {
      get: jest.fn().mockImplementation(({ userId, characterId }: { userId: string; characterId: string }) => {
        if (userId === 'u1' && characterId === 'ageha') return Promise.resolve(null);
        return Promise.resolve({
          Bedtime: '01:30',
          WakeUpTime: '09:30',
          UserID: userId,
          CharacterID: characterId,
          CreatedAt: 0,
          UpdatedAt: 0,
        });
      }),
    };
    mockStudyForUser
      .mockRejectedValueOnce(new Error('hiyori エラー')) // u1 hiyori
      .mockResolvedValue({ outcome: 'studied', savedCount: 1 }); // u2 系

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams({ lifecycleRepo: lifecycleRepo as never }));

    // u1 はキャラエラーがあるので failed（lifecycle なしより優先）
    expect(result.failedUsers).toBe(1);
    expect(result.failedUserIds).toContain('u1');
  });

  it('getCharacterDefinitionById が undefined を返すキャラクターはスキップ', async () => {
    mockGetAllCharacterIds.mockReturnValue(['hiyori', 'unknown-char']);
    mockGetCharacterDefinitionById.mockImplementation((id: string) => {
      if (id === 'hiyori') {
        return {
          id: 'hiyori',
          displayName: '桃瀬ひより',
          notificationName: 'ひより',
          personality: { basePrompt: '', speechStyle: '', preferences: { likes: [], dislikes: [] } },
          voiceConfig: { provider: 'voicevox' as const, speakerId: 14 },
          license: { displayText: '', creditName: '' },
        };
      }
      return undefined;
    });
    mockStudyForUser.mockResolvedValue({ outcome: 'studied', savedCount: 1 });

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    await studyAllUsers(makeParams());

    // hiyori のみ処理（unknown-char は undefined なのでスキップ）
    expect(mockStudyForUser).toHaveBeenCalledWith(expect.anything(), 'hiyori', expect.anything());
    expect(mockStudyForUser).not.toHaveBeenCalledWith(
      expect.anything(),
      'unknown-char',
      expect.anything()
    );
  });
});
