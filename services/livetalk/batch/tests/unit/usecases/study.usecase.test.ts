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
    voiceConfig: { speakerId: 14 },
    license: { displayText: '', creditName: '' },
  },
  studyForUser: jest.fn(),
}));

const mockStudyForUser = jest.requireMock('@nagiyu/livetalk-core').studyForUser as jest.Mock;

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
});
