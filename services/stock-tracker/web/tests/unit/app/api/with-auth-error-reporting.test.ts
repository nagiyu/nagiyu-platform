import { NextRequest } from 'next/server';
import * as awsModule from '@nagiyu/aws';
import { GET } from '../../../../app/api/tickers/route';
import { getSession } from '../../../../lib/auth';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/stock-tracker-core', () => ({
  ...jest.requireActual('@nagiyu/stock-tracker-core'),
  createTickerRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
}));

// withAuth は実物を使い、認証処理の例外が入口のラッパーまで届くことを確かめる
describe('withAuth の外側のラッパー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('認証処理が失敗したらサービスの 500 を返し、リクエスト情報つきで報告する', async () => {
    (getSession as jest.Mock).mockRejectedValue(new Error('auth failed'));

    const response = await GET(new NextRequest('http://localhost/api/tickers?exchangeId=NSDQ'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'INTERNAL_ERROR',
      message: '内部エラーが発生しました',
    });
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Web API: ティッカー一覧取得エラー',
        message: 'auth failed',
        context: expect.objectContaining({ method: 'GET', pathname: '/api/tickers' }),
      })
    );
  });

  it('未認証は 401 を返し、報告しない', async () => {
    (getSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/tickers'));

    expect(response.status).toBe(401);
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });
});
