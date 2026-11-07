/**
 * @jest-environment node
 */

import { USAGE_LIMITS, resetInMemoryRepositories } from '@nagiyu/quick-clip-core';
import { createUsageService } from '@/lib/server/usage-context';
import { GET } from '@/app/api/usage/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth', () => ({
  getSession: () => mockGetSession(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
      json: async () => body,
    }),
  },
}));

const createRequest = (headers: Record<string, string> = {}): Request =>
  ({ headers: new Headers(headers) }) as Request;

describe('GET /api/usage', () => {
  beforeEach(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
    resetInMemoryRepositories();
    mockGetSession.mockResolvedValue(null);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    jest.restoreAllMocks();
  });

  it('未ログインで Cookie が無ければ、匿名 ID を発行して未ログインの段の上限を返す', async () => {
    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      tier: 'anonymous',
      limits: { aiPerMonth: 0, noAiPerMonth: 3, maxDurationSec: 3600 },
      used: { ai: 0, noAi: 0 },
      remaining: { ai: 0, noAi: 3 },
    });
    expect(response.headers.get('set-cookie')).toMatch(/^qc_anon_id=[0-9a-f-]{36};.*HttpOnly/);
  });

  it('Cookie があれば再発行せず、その ID の使用済みを返す', async () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const first = await GET(createRequest({ cookie: `qc_anon_id=${id}` }));
    expect(first.headers.get('set-cookie')).toBeNull();

    await createUsageService().consume({
      subject: `ANON#${id}`,
      tier: 'anonymous',
      aiAnalysis: false,
    });
    const response = await GET(createRequest({ cookie: `qc_anon_id=${id}` }));

    expect((await response.json()).remaining).toEqual({ ai: 0, noAi: 2 });
  });

  it('ログイン中はユーザー ID ごとに、権限に応じた段を返す', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@example.com', name: 'A', roles: ['quick-clip-standard'] },
      expires: '2999-01-01T00:00:00.000Z',
    });

    const response = await GET(createRequest());
    const body = await response.json();

    expect(body.tier).toBe('standard');
    expect(body.remaining).toEqual({
      ai: USAGE_LIMITS.standard.aiPerMonth,
      noAi: USAGE_LIMITS.standard.noAiPerMonth,
    });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('取得に失敗したら 500 を返す', async () => {
    const { createUsageRepository } = jest.requireActual('@nagiyu/quick-clip-core');
    jest.spyOn(createUsageRepository(), 'getCounts').mockRejectedValue(new Error('down'));

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    // 例外で 500 を返すときも、新しく発行した匿名 ID を渡す
    expect(response.headers.get('set-cookie')).toMatch(/^qc_anon_id=/);
    expect(await response.json()).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: '利用状況の取得に失敗しました',
    });
  });
});
