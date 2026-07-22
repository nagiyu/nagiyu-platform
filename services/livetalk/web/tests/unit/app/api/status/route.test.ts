/**
 * @jest-environment node
 */
import { GET } from '@/app/api/status/route';
import { getSession } from '@/lib/server/session';
import {
  getLifecycleRepository,
  getNotificationEventRepository,
  getStudyTopicRepository,
  getMessageRepository,
} from '@/lib/server/repositories';
import type {
  LifecycleRepository,
  NotificationEventRepository,
  StudyTopicRepository,
  MessageRepository,
} from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/server/repositories', () => ({
  getLifecycleRepository: jest.fn(),
  getNotificationEventRepository: jest.fn(),
  getStudyTopicRepository: jest.fn(),
  getMessageRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetLifecycleRepo = getLifecycleRepository as jest.MockedFunction<
  typeof getLifecycleRepository
>;
const mockGetNotifEventRepo = getNotificationEventRepository as jest.MockedFunction<
  typeof getNotificationEventRepository
>;
const mockGetStudyTopicRepo = getStudyTopicRepository as jest.MockedFunction<
  typeof getStudyTopicRepository
>;
const mockGetMessageRepo = getMessageRepository as jest.MockedFunction<typeof getMessageRepository>;

const livetalkUserSession = {
  user: {
    userId: 'u1',
    googleId: 'g1',
    email: 'user@example.com',
    name: 'User',
    roles: ['livetalk-user'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

const adminSession = {
  user: {
    userId: 'u1',
    googleId: 'g1',
    email: 'admin@example.com',
    name: 'Admin',
    roles: ['livetalk-admin'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

const makeLifecycleRepo = () =>
  ({
    get: jest.fn(async () => ({
      UserID: 'g1',
      CharacterID: 'hiyori',
      Bedtime: '01:30',
      WakeUpTime: '09:30',
      CreatedAt: 0,
      UpdatedAt: 0,
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
    listByStatus: jest.fn(async () => Array(pendingCount).fill({ TopicID: 't1' })),
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
}

describe('GET /api/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(401);
  });

  it('livetalk:admin 権限なし（livetalk-user のみ）は 403', async () => {
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
        UserID: 'g1',
        CharacterID: 'hiyori',
        Bedtime: '01:30',
        WakeUpTime: '09:30',
        UserActivityProfile: profile,
        CreatedAt: 0,
        UpdatedAt: 0,
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
      UserID: 'g1',
      NotifID: `notif-${i}`,
      Kind: 'normal' as const,
      Title: 'タイトル',
      Body: longBody,
      CreatedAt: 1000 * (i + 1),
      Ttl: 9999999,
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
      UserID: 'g1',
      CharacterID: 'ageha',
      Bedtime: '01:30',
      WakeUpTime: '09:30',
      CreatedAt: 0,
      UpdatedAt: 0,
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
      UserID: 'g1',
      CharacterID: 'hiyori',
      Bedtime: '01:30',
      WakeUpTime: '09:30',
      CreatedAt: 0,
      UpdatedAt: 0,
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
});
