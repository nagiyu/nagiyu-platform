import { NextRequest } from 'next/server';
import { GET } from '../../../../app/api/axis-performance/route';
import {
  createModelSnapshotRepository,
  createPerformanceDailyRepository,
} from '../../../../lib/repository-factory';
import { performanceDaily, snapshot } from '../../lib/forecast/fixtures';

jest.mock('../../../../lib/repository-factory', () => ({
  createModelSnapshotRepository: jest.fn(),
  createPerformanceDailyRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
}));

describe('GET /api/axis-performance', () => {
  const mockGetByPeriod = jest.fn();
  const mockGetLatestBefore = jest.fn();

  const call = (query = '') =>
    GET(new NextRequest(`http://localhost/api/axis-performance${query}`), {
      params: Promise.resolve({}),
    } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    (createPerformanceDailyRepository as jest.Mock).mockReturnValue({
      getByPeriod: mockGetByPeriod,
    });
    (createModelSnapshotRepository as jest.Mock).mockReturnValue({
      getLatestBefore: mockGetLatestBefore,
    });
    mockGetByPeriod.mockResolvedValue([]);
    mockGetLatestBefore.mockResolvedValue(null);
  });

  it('正常系: 省略時は DIR / 90d / ALL で JP・US を合算する', async () => {
    mockGetByPeriod.mockImplementation(async (_q: string, market: string) => [
      performanceDaily({
        market,
        date: market === 'JP' ? '2026-05-01' : '2026-05-02',
        evaluatedCount: 10,
        hitCount: 5,
      }),
    ]);
    mockGetLatestBefore.mockImplementation(async (_q: string, market: string) =>
      snapshot({
        market,
        date: market === 'JP' ? '2026-05-01' : '2026-05-02',
        neutralBand: {
          lower: market === 'JP' ? -0.1 : -0.2,
          upper: 0.1,
          decidedOn: '2026-04-01',
        },
      })
    );

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetByPeriod).toHaveBeenCalledWith('DIR', 'JP', '0000-01-01');
    expect(mockGetByPeriod).toHaveBeenCalledWith('DIR', 'US', '0000-01-01');
    expect(mockGetLatestBefore).toHaveBeenCalledWith('DIR', 'JP', '9999-12-31');
    expect(body).toMatchObject({
      question: 'DIR',
      period: '90d',
      market: 'ALL',
      from: '2026-02-02',
      to: '2026-05-02',
      evaluatedCount: 20,
      hitRate: 0.5,
      neutralBand: { lower: -0.2, upper: 0.1 },
    });
  });

  it('正常系: 市場を指定すると、その市場だけを読む', async () => {
    const response = await call('?question=MKT&market=US&period=30d');

    expect(response.status).toBe(200);
    expect(mockGetByPeriod).toHaveBeenCalledTimes(1);
    expect(mockGetByPeriod).toHaveBeenCalledWith('MKT', 'US', '0000-01-01');
  });

  it('正常系: データが無ければ空の成績を返す', async () => {
    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.from).toBeNull();
    expect(body.to).toBeNull();
    expect(body.calibration).toEqual([]);
    expect(body.neutralBand).toBeNull();
  });

  it.each([
    [
      '?question=XXX',
      'INVALID_QUESTION',
      'question は DIR / VOL / MKT のいずれかで指定してください',
    ],
    ['?period=7d', 'INVALID_PERIOD', 'period は 30d / 90d / all のいずれかで指定してください'],
    ['?market=EU', 'INVALID_MARKET', 'market は ALL / JP / US のいずれかで指定してください'],
    [
      '?question=MKT&market=ALL',
      'MARKET_ALL_NOT_ALLOWED',
      'question=MKT では market=ALL を指定できません',
    ],
  ])('異常系: %s は 400', async (query, error, message) => {
    const response = await call(query);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error, message });
    expect(mockGetByPeriod).not.toHaveBeenCalled();
  });

  it('異常系: リポジトリが失敗したら 500', async () => {
    mockGetByPeriod.mockRejectedValue(new Error('db error'));
    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_ERROR',
      message: '軸ごとの成績の取得に失敗しました',
    });
  });
});
