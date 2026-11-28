/**
 * @jest-environment node
 */
import { GET } from '@/app/api/study-status/route';
import { getSession } from '@/lib/server/session';
import { createProfileRepository, STUDY_FREE_TRIAL_DURATION_MS } from '@nagiyu/livetalk-core';
import type { ProfileRepository } from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  createProfileRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockCreateProfileRepo = createProfileRepository as jest.MockedFunction<
  typeof createProfileRepository
>;

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const sessionWith = (roles: string[]) => ({
  user: { id: 'u1', email: 'u@example.com', name: 'U', roles },
  expires: new Date(NOW + 60 * 1000).toISOString(),
});

const profileCreatedAt = (createdAt: number | null) =>
  ({
    getById: jest.fn(async () =>
      createdAt === null ? null : { userId: 'u1', createdAt, updatedAt: createdAt, lastActiveAt: 0 }
    ),
    upsert: jest.fn(),
    listAllUserIds: jest.fn(),
  }) as unknown as ProfileRepository;

describe('GET /api/study-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => jest.restoreAllMocks());

  it('未ログインは 401', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('運営者は hidden', async () => {
    mockGetSession.mockResolvedValue(sessionWith(['livetalk-operator']));
    mockCreateProfileRepo.mockReturnValue(profileCreatedAt(NOW - 100 * DAY));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'hidden' });
  });

  it('スタンダードは hidden', async () => {
    mockGetSession.mockResolvedValue(sessionWith(['livetalk-standard']));
    mockCreateProfileRepo.mockReturnValue(profileCreatedAt(NOW - 100 * DAY));
    const res = await GET();
    expect(await res.json()).toEqual({ state: 'hidden' });
  });

  it('無料のお試し中は残り日数を返す', async () => {
    mockGetSession.mockResolvedValue(sessionWith([]));
    mockCreateProfileRepo.mockReturnValue(profileCreatedAt(NOW - 2 * DAY));
    const res = await GET();
    expect(await res.json()).toEqual({
      state: 'trial',
      remainingDays: STUDY_FREE_TRIAL_DURATION_MS / DAY - 2,
    });
  });

  it('無料のお試しのあとは ended', async () => {
    mockGetSession.mockResolvedValue(sessionWith([]));
    mockCreateProfileRepo.mockReturnValue(profileCreatedAt(NOW - STUDY_FREE_TRIAL_DURATION_MS));
    const res = await GET();
    expect(await res.json()).toEqual({ state: 'ended' });
  });

  it('無料で Profile がないときは hidden', async () => {
    mockGetSession.mockResolvedValue(sessionWith([]));
    mockCreateProfileRepo.mockReturnValue(profileCreatedAt(null));
    const res = await GET();
    expect(await res.json()).toEqual({ state: 'hidden' });
  });

  it('リポジトリが失敗したら 500 と日本語のメッセージ', async () => {
    mockGetSession.mockResolvedValue(sessionWith([]));
    mockCreateProfileRepo.mockReturnValue({
      getById: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as ProfileRepository);
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
