/**
 * @jest-environment node
 */
import { GET } from '@/app/api/status/route';
import { getSession } from '@/lib/server/session';
import {
  createLifecycleRepository,
  createNotificationEventRepository,
  createStudyTopicRepository,
  createMessageRepository,
  createProfileRepository,
  createStudyUsageRepository,
  STUDY_DAILY_RESEARCH_LIMIT_GLOBAL,
} from '@nagiyu/livetalk-core';
import type {
  LifecycleRepository,
  NotificationEventRepository,
  StudyTopicRepository,
  MessageRepository,
  ProfileRepository,
  StudyUsageRepository,
} from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  createLifecycleRepository: jest.fn(),
  createNotificationEventRepository: jest.fn(),
  createStudyTopicRepository: jest.fn(),
  createMessageRepository: jest.fn(),
  createProfileRepository: jest.fn(),
  createStudyUsageRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetLifecycleRepo = createLifecycleRepository as jest.MockedFunction<
  typeof createLifecycleRepository
>;
const mockGetNotifEventRepo = createNotificationEventRepository as jest.MockedFunction<
  typeof createNotificationEventRepository
>;
const mockGetStudyTopicRepo = createStudyTopicRepository as jest.MockedFunction<
  typeof createStudyTopicRepository
>;
const mockGetMessageRepo = createMessageRepository as jest.MockedFunction<
  typeof createMessageRepository
>;

const mockGetProfileRepo = createProfileRepository as jest.MockedFunction<
  typeof createProfileRepository
>;
const mockGetStudyUsageRepo = createStudyUsageRepository as jest.MockedFunction<
  typeof createStudyUsageRepository
>;

const DAY = 24 * 60 * 60 * 1000;

const mockStudyRepos = (createdAt: number | null, usage = { userTotal: 0, globalTotal: 0 }) => {
  mockGetProfileRepo.mockReturnValue({
    getById: jest.fn(async () =>
      createdAt === null ? null : { userId: 'u1', createdAt, updatedAt: createdAt, lastActiveAt: 0 }
    ),
  } as unknown as ProfileRepository);
  mockGetStudyUsageRepo.mockReturnValue({
    readToday: jest.fn(async () => usage),
  } as unknown as StudyUsageRepository);
};

const livetalkUserSession = {
  user: {
    id: 'u1',
    email: 'user@example.com',
    name: 'User',
    roles: [],
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

const adminSession = {
  user: {
    id: 'u1',
    email: 'admin@example.com',
    name: 'Admin',
    roles: ['livetalk-admin'],
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

const makeLifecycleRepo = () =>
  ({
    get: jest.fn(async () => ({
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
      createdAt: 0,
      updatedAt: 0,
    })),
  }) as unknown as LifecycleRepository;

const makeEmptyLifecycleRepo = () =>
  ({
    get: jest.fn(async () => null),
  }) as unknown as LifecycleRepository;

const makeNotifEventRepo = () =>
  ({
    listByUser: jest.fn(async () => []),
  }) as unknown as NotificationEventRepository;

const makeStudyTopicRepo = (pendingCount = 0) =>
  ({
    listByStatus: jest.fn(async () => Array(pendingCount).fill({ topicId: 't1' })),
  }) as unknown as StudyTopicRepository;

const makeMessageRepo = () =>
  ({
    listSince: jest.fn(async () => []),
  }) as unknown as MessageRepository;

const buildGetRequest = (characterId?: string) => {
  const url = characterId
    ? `http://localhost/api/status?characterId=${encodeURIComponent(characterId)}`
    : 'http://localhost/api/status';
  return new Request(url, { method: 'GET' });
};

function setupDefaultMocks() {
  mockGetLifecycleRepo.mockReturnValue(makeLifecycleRepo());
  mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
  mockGetStudyTopicRepo.mockReturnValue(makeStudyTopicRepo(1));
  mockGetMessageRepo.mockReturnValue(makeMessageRepo());
  mockStudyRepos(null);
}

describe('GET /api/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStudyRepos(null);
  });

  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(401);
  });

  it('livetalk:admin 権限なし（ロールなし）は 403', async () => {
    mockGetSession.mockResolvedValueOnce(livetalkUserSession);
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(403);
  });

  it('livetalk-admin 権限ありは 200 でステータスデータを返す', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession);
    setupDefaultMocks();

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty('lifecycle');
    expect(json).toHaveProperty('recentNotifications');
    expect(json).toHaveProperty('notifyDecision');
    expect(json).toHaveProperty('studyTopicPendingCount');
    expect(json).toHaveProperty('study');
  });

  it('勉強の節に、区分・お試し・今日の回数を返す (無料のお試し中)', async () => {
    const now = Date.now();
    mockGetSession.mockResolvedValueOnce(adminSession);
    setupDefaultMocks();
    mockStudyRepos(now - DAY, { userTotal: 3, globalTotal: 50 });

    const json = await (await GET(buildGetRequest())).json();

    expect(json.study).toMatchObject({
      tier: 'free',
      trial: { state: 'active' },
      user: { used: 3, reached: false },
      global: { used: 50, limit: STUDY_DAILY_RESEARCH_LIMIT_GLOBAL, reached: false },
    });
  });

  it('Profile がない無料は、お試しが始まっていないことと、上限に達していることを返す', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession);
    setupDefaultMocks();

    const json = await (await GET(buildGetRequest())).json();

    expect(json.study.trial).toEqual({ state: 'not_started' });
    expect(json.study.user).toEqual({ used: 0, limit: 0, reached: true });
  });

  it('運営者はお試しの項目を持たない', async () => {
    mockGetSession.mockResolvedValueOnce({
      ...adminSession,
      user: { ...adminSession.user, roles: ['livetalk-admin', 'livetalk-operator'] },
    });
    setupDefaultMocks();

    const json = await (await GET(buildGetRequest())).json();

    expect(json.study.tier).toBe('operator');
    expect(json.study.trial).toBeNull();
  });

  it('lifecycle が null の場合はデフォルト値でフォールバックする', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession);
    mockGetLifecycleRepo.mockReturnValue(makeEmptyLifecycleRepo());
    mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
    mockGetStudyTopicRepo.mockReturnValue(makeStudyTopicRepo());
    mockGetMessageRepo.mockReturnValue(makeMessageRepo());

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.lifecycle.bedtime).toBe('01:30');
    expect(json.lifecycle.wakeUpTime).toBe('09:30');
    expect(json.lifecycle.userActivityProfile).toBeNull();
  });

  it('lifecycle.userActivityProfile が存在する場合は返却する', async () => {
    const profile = {
      morningPeak: '09:00',
      eveningPeak: '21:00',
      sampleSize: 10,
      lastLearnedAt: '2026-06-01T00:00:00.000Z',
    };
    mockGetSession.mockResolvedValueOnce(adminSession);
    mockGetLifecycleRepo.mockReturnValue({
      get: jest.fn(async () => ({
        userId: 'u1',
        characterId: 'hiyori',
        bedtime: '01:30',
        wakeUpTime: '09:30',
        userActivityProfile: profile,
        createdAt: 0,
        updatedAt: 0,
      })),
    } as unknown as LifecycleRepository);
    mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
    mockGetStudyTopicRepo.mockReturnValue(makeStudyTopicRepo(2));
    mockGetMessageRepo.mockReturnValue(makeMessageRepo());

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.lifecycle.userActivityProfile).toEqual(profile);
    expect(json.studyTopicPendingCount).toBe(2);
  });

  it('通知履歴は最大 5 件・body は 100 文字で切り詰める', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession);
    mockGetLifecycleRepo.mockReturnValue(makeLifecycleRepo());

    const longBody = 'a'.repeat(200);
    const events = Array.from({ length: 7 }, (_, i) => ({
      userId: 'u1',
      notifId: `notif-${i}`,
      characterId: 'hiyori',
      kind: 'normal' as const,
      title: 'タイトル',
      body: longBody,
      createdAt: 1000 * (i + 1),
      updatedAt: 1000 * (i + 1),
      expiresAt: 9_999_999_000,
    }));
    mockGetNotifEventRepo.mockReturnValue({
      listByUser: jest.fn(async () => events),
    } as unknown as NotificationEventRepository);
    mockGetStudyTopicRepo.mockReturnValue(makeStudyTopicRepo());
    mockGetMessageRepo.mockReturnValue(makeMessageRepo());

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.recentNotifications).toHaveLength(5);
    expect(json.recentNotifications[0].body).toHaveLength(100);
  });

  it('notifyDecision に notify と reason/toneBucket が含まれる', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession);
    setupDefaultMocks();

    const res = await GET(buildGetRequest());
    const json = await res.json();

    expect(json.notifyDecision).toHaveProperty('notify');
    // notify=true (normal) or notify=false (reason) どちらかの構造
    if (json.notifyDecision.notify) {
      expect(json.notifyDecision).toHaveProperty('kind');
    } else {
      expect(json.notifyDecision).toHaveProperty('reason');
    }
  });

  it('リポジトリエラーは 500 を返す', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValueOnce(adminSession);
    mockGetLifecycleRepo.mockReturnValue({
      get: jest.fn(async () => {
        throw new Error('DynamoDB エラー');
      }),
    } as unknown as LifecycleRepository);
    mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
    mockGetStudyTopicRepo.mockReturnValue(makeStudyTopicRepo());
    mockGetMessageRepo.mockReturnValue(makeMessageRepo());

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe('FETCH_FAILED');
    consoleSpy.mockRestore();
  });

  it('characterId クエリで指定したキャラの characterId でリポジトリを呼び出す', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession);
    const mockGet = jest.fn(async () => ({
      userId: 'u1',
      characterId: 'ageha',
      bedtime: '01:30',
      wakeUpTime: '09:30',
      createdAt: 0,
      updatedAt: 0,
    }));
    mockGetLifecycleRepo.mockReturnValue({ get: mockGet } as unknown as LifecycleRepository);
    mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
    mockGetStudyTopicRepo.mockReturnValue(makeStudyTopicRepo());
    mockGetMessageRepo.mockReturnValue(makeMessageRepo());

    const res = await GET(buildGetRequest('ageha'));
    expect(res.status).toBe(200);
    // lifecycle.get が 'ageha' で呼ばれていることを確認
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ characterId: 'ageha' }));
  });

  it('不正な characterId は DEFAULT_CHARACTER_ID にフォールバックする', async () => {
    mockGetSession.mockResolvedValueOnce(adminSession);
    const mockGet = jest.fn(async () => ({
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
      createdAt: 0,
      updatedAt: 0,
    }));
    mockGetLifecycleRepo.mockReturnValue({ get: mockGet } as unknown as LifecycleRepository);
    mockGetNotifEventRepo.mockReturnValue(makeNotifEventRepo());
    mockGetStudyTopicRepo.mockReturnValue(makeStudyTopicRepo());
    mockGetMessageRepo.mockReturnValue(makeMessageRepo());

    const res = await GET(buildGetRequest('no-such-character'));
    expect(res.status).toBe(200);
    // 不正 ID は既定 characterId（hiyori）にフォールバック
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ characterId: 'hiyori' }));
  });

  describe('通知の記録をキャラクターで絞る', () => {
    // 日本時間の 12:00 (起床後・就寝前)。1 日の境界は日本時間の 0 時
    const NOW = new Date('2026-06-10T03:00:00.000Z');
    const makeEvent = (notifId: string, characterId: string, createdAt: number) => ({
      userId: 'u1',
      notifId,
      characterId,
      kind: 'normal' as const,
      title: 'タイトル',
      body: '本文',
      createdAt,
      updatedAt: createdAt,
      expiresAt: 9_999_999_999_000,
    });

    beforeEach(() => {
      // Date だけを固定し、非同期処理の待ちには影響させない
      jest.useFakeTimers({
        now: NOW,
        doNotFake: [
          'nextTick',
          'setImmediate',
          'clearImmediate',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'queueMicrotask',
          'performance',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
        ],
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const setupWithEvents = (events: ReturnType<typeof makeEvent>[]) => {
      const listByUser = jest.fn(async () => events);
      mockGetSession.mockResolvedValueOnce(adminSession);
      mockGetLifecycleRepo.mockReturnValue(makeLifecycleRepo());
      mockGetNotifEventRepo.mockReturnValue({
        listByUser,
      } as unknown as NotificationEventRepository);
      mockGetStudyTopicRepo.mockReturnValue(makeStudyTopicRepo());
      mockGetMessageRepo.mockReturnValue(makeMessageRepo());
      return listByUser;
    };

    it('通知の記録をバッチと同じ直近 60 件で読む', async () => {
      const listByUser = setupWithEvents([]);

      await GET(buildGetRequest());

      expect(listByUser).toHaveBeenCalledWith('u1', 60);
    });

    it('他キャラの本日の平常通知では daily_cap にならず、一覧にも出ない', async () => {
      const otherAt = NOW.getTime() - 60 * 60 * 1000;
      setupWithEvents([makeEvent('other-1', 'ageha', otherAt)]);

      const res = await GET(buildGetRequest('hiyori'));
      const json = await res.json();

      expect(json.notifyDecision).toMatchObject({ notify: true, kind: 'normal' });
      expect(json.recentNotifications).toEqual([]);
    });

    it('表示キャラの本日の平常通知は daily_cap になり、他キャラ分は一覧に混ざらない', async () => {
      const at = NOW.getTime() - 60 * 60 * 1000;
      setupWithEvents([makeEvent('other-1', 'ageha', at + 1000), makeEvent('own-1', 'hiyori', at)]);

      const res = await GET(buildGetRequest('hiyori'));
      const json = await res.json();

      expect(json.notifyDecision).toMatchObject({ notify: false, reason: 'daily_cap' });
      expect(json.recentNotifications.map((e: { notifId: string }) => e.notifId)).toEqual([
        'own-1',
      ]);
    });
  });
});
