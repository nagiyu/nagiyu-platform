jest.mock('@nagiyu/livetalk-core', () => ({
  DEFAULT_CHARACTER_ID: 'hiyori',
  hiyori: {
    id: 'hiyori',
    displayName: '桃瀬ひより',
    personality: {
      basePrompt: '',
      speechStyle: '優しい口調',
      preferences: { likes: [], dislikes: [] },
    },
    voiceConfig: { provider: 'voicevox' as const, speakerId: 14 },
    license: { displayText: '', creditName: '' },
  },
  studyForUser: jest.fn(),
  generateNotesForUser: jest.fn(),
}));

const mockStudyForUser = jest.requireMock('@nagiyu/livetalk-core').studyForUser as jest.Mock;
const mockGenerateNotesForUser = jest.requireMock('@nagiyu/livetalk-core')
  .generateNotesForUser as jest.Mock;

describe('studyAllUsers', () => {
  const mockDocClient = {
    send: jest.fn(),
  };

  const makeParams = (overrides = {}) => ({
    docClient: mockDocClient as never,
    tableName: 'test-table',
    lifecycleRepo: {
      get: jest.fn().mockResolvedValue({
        Bedtime: '01:30',
        WakeUpTime: '09:30',
        UserID: 'u1',
        CharacterID: 'hiyori',
        CreatedAt: 0,
        UpdatedAt: 0,
      }),
    } as never,
    interestRepo: {} as never,
    knowledgeRepo: {} as never,
    researchClient: {} as never,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDocClient.send.mockResolvedValue({
      Items: [{ UserID: 'u1' }, { UserID: 'u2' }],
    });
    mockGenerateNotesForUser.mockResolvedValue({ generatedCount: 0 });
  });

  it('全ユーザーをループして studyForUser を呼ぶ', async () => {
    mockStudyForUser.mockResolvedValue({ outcome: 'studied', savedCount: 1 });

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams());

    expect(result.studiedUsers).toBe(2);
    expect(result.skippedUsers).toBe(0);
    expect(result.failedUsers).toBe(0);
    expect(mockStudyForUser).toHaveBeenCalledTimes(2);
  });

  it('studyForUser がスキップを返したユーザーをカウント', async () => {
    mockStudyForUser
      .mockResolvedValueOnce({ outcome: 'studied', savedCount: 1 })
      .mockResolvedValueOnce({ outcome: 'skipped', skipReason: 'テスト' });

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams());

    expect(result.studiedUsers).toBe(1);
    expect(result.skippedUsers).toBe(1);
  });

  it('lifecycle が null のユーザーはスキップ', async () => {
    const lifecycleRepo = {
      get: jest.fn().mockResolvedValue(null),
    };

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams({ lifecycleRepo: lifecycleRepo as never }));

    expect(result.skippedUsers).toBe(2);
    expect(mockStudyForUser).not.toHaveBeenCalled();
  });

  it('studyForUser が throw したユーザーは failedUsers にカウント', async () => {
    mockStudyForUser.mockRejectedValue(new Error('DynamoDB エラー'));

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams());

    expect(result.failedUsers).toBe(2);
    expect(result.failedUserIds).toEqual(['u1', 'u2']);
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

  it('noteRepo 指定時、勉強したユーザーに対しノート生成を行い件数を集計する（Phase 5c）', async () => {
    mockStudyForUser.mockResolvedValue({ outcome: 'studied', savedCount: 1 });
    mockGenerateNotesForUser.mockResolvedValue({ generatedCount: 2 });
    const noteRepo = { put: jest.fn(), list: jest.fn(), get: jest.fn(), listRecent: jest.fn() };

    const { studyAllUsers } = await import('../../../src/usecases/study.usecase.js');
    const result = await studyAllUsers(makeParams({ noteRepo: noteRepo as never }));

    // u1 / u2 各 2 件 = 4 件
    expect(result.generatedNotes).toBe(4);
    expect(mockGenerateNotesForUser).toHaveBeenCalledTimes(2);
    expect(mockGenerateNotesForUser).toHaveBeenCalledWith(
      'u1',
      'hiyori',
      expect.objectContaining({ noteRepo })
    );
  });

  it('スキップしたユーザーにはノート生成を行わない（Phase 5c）', async () => {
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
});
