/**
 * @jest-environment node
 */
import { GET } from '@/app/api/lifecycle/route';
import { getSession } from '@/lib/server/session';
import { getLifecycleRepository } from '@/lib/server/repositories';
import type { LifecycleEntity, LifecycleRepository } from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/server/repositories', () => ({
  getLifecycleRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetLifecycleRepo = getLifecycleRepository as jest.MockedFunction<
  typeof getLifecycleRepository
>;

const validSession = {
  user: {
    userId: 'u1',
    googleId: 'g1',
    email: 'u@example.com',
    name: 'U',
    roles: ['livetalk-user'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

const makeEntity = (bedtime: string, wakeUpTime: string): LifecycleEntity => ({
  UserID: 'g1',
  CharacterID: 'hiyori',
  Bedtime: bedtime,
  WakeUpTime: wakeUpTime,
  CreatedAt: 0,
  UpdatedAt: 0,
});

const makeRepo = (entity: LifecycleEntity | null): LifecycleRepository => ({
  get: jest.fn(async () => entity),
  upsert: jest.fn(async () => entity ?? makeEntity('01:30', '09:30')),
  updateUserActivityProfile: jest.fn(async () => entity ?? makeEntity('01:30', '09:30')),
  updateSchedule: jest.fn(async () => entity ?? makeEntity('01:30', '09:30')),
});

const buildGetRequest = (characterId?: string): Request => {
  const url = characterId
    ? `http://localhost/api/lifecycle?characterId=${encodeURIComponent(characterId)}`
    : 'http://localhost/api/lifecycle';
  return new Request(url, { method: 'GET' });
};

describe('GET /api/lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(401);
  });

  it('就寝中の時間帯（終日 sleeping 設定）なら state: sleeping を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    // bedtime > wakeUpTime かつ起床直後の隙間が極小 → ほぼ常時 sleeping
    // 00:00 起床 / 00:00 就寝は不可なので、起床 00:00・就寝 23:59 で
    // 00:00〜23:59 を sleeping にする（境界の 1 分のみ awake）
    mockGetLifecycleRepo.mockReturnValue(makeRepo(makeEntity('00:01', '00:00')));
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe('sleeping');
  });

  it('起床中の時間帯（終日 awake 設定）なら state: awake を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    // bedtime < wakeUpTime だが窓が極小（00:00〜00:01 のみ sleeping）→ ほぼ常時 awake
    mockGetLifecycleRepo.mockReturnValue(makeRepo(makeEntity('00:00', '00:01')));
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe('awake');
  });

  it('Lifecycle が未設定でもデフォルト定数で判定して 200 を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    mockGetLifecycleRepo.mockReturnValue(makeRepo(null));
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(['awake', 'sleeping']).toContain(json.state);
  });

  it('リポジトリエラーでも fail-safe で state: awake / 200 を返す', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(validSession);
    mockGetLifecycleRepo.mockReturnValue({
      get: jest.fn(async () => {
        throw new Error('db error');
      }),
      upsert: jest.fn(),
    } as unknown as LifecycleRepository);
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe('awake');
    consoleSpy.mockRestore();
  });

  it('characterId クエリで指定したキャラの characterId でリポジトリを呼び出す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const mockGet = jest.fn(async () => makeEntity('01:30', '09:30'));
    mockGetLifecycleRepo.mockReturnValue({
      get: mockGet,
      upsert: jest.fn(),
      updateUserActivityProfile: jest.fn(),
      updateSchedule: jest.fn(),
    } as unknown as LifecycleRepository);

    const res = await GET(buildGetRequest('ageha'));
    expect(res.status).toBe(200);
    // get が 'ageha' で呼ばれていることを確認
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ characterId: 'ageha' }));
  });

  it('不正な characterId は DEFAULT_CHARACTER_ID にフォールバックする', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const mockGet = jest.fn(async () => makeEntity('01:30', '09:30'));
    mockGetLifecycleRepo.mockReturnValue({
      get: mockGet,
      upsert: jest.fn(),
      updateUserActivityProfile: jest.fn(),
      updateSchedule: jest.fn(),
    } as unknown as LifecycleRepository);

    const res = await GET(buildGetRequest('unknown-character'));
    expect(res.status).toBe(200);
    // 不正 ID は既定 characterId（hiyori）にフォールバックして呼ばれる
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ characterId: 'hiyori' }));
  });

  it('characterId クエリ未指定は DEFAULT_CHARACTER_ID を使う', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const mockGet = jest.fn(async () => makeEntity('01:30', '09:30'));
    mockGetLifecycleRepo.mockReturnValue({
      get: mockGet,
      upsert: jest.fn(),
      updateUserActivityProfile: jest.fn(),
      updateSchedule: jest.fn(),
    } as unknown as LifecycleRepository);

    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ characterId: 'hiyori' }));
  });
});
