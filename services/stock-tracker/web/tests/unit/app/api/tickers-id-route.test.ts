import { NextRequest } from 'next/server';
import { PUT, DELETE } from '../../../../app/api/tickers/[id]/route';
import { createTickerRepository } from '../../../../lib/repository-factory';
import * as awsModule from '@nagiyu/aws';
import { MALFORMED_BODY_CASES } from './invalidBodyCases';

jest.mock('../../../../lib/repository-factory', () => ({
  createTickerRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  createApiErrorReporting: jest.requireActual('@nagiyu/nextjs').createApiErrorReporting,
  readJsonObjectBody: jest.requireActual('@nagiyu/nextjs').readJsonObjectBody,
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { id: 'test-user' } }, ...args);
  }),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('PUT /api/tickers/[id]', () => {
  const mockUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createTickerRepository as jest.Mock).mockReturnValue({ update: mockUpdate });
  });

  it('DynamoDB エラー時に reportErrorEvent が呼ばれる', async () => {
    mockUpdate.mockRejectedValue(new Error('DynamoDB 書き込みエラー'));

    const request = new NextRequest('http://localhost/api/tickers/NSDQ:AAPL', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Apple Inc.' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await PUT(request, makeParams('NSDQ:AAPL'));

    expect(response.status).toBe(500);
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: ティッカー更新エラー',
        message: expect.stringContaining('DynamoDB'),
      })
    );
    expect(awsModule.reportErrorEvent).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/tickers/[id] のリクエストボディ検証', () => {
  const mockUpdate = jest.fn();

  const createRequest = (rawBody: string) =>
    new NextRequest('http://localhost/api/tickers/NSDQ:AAPL', {
      method: 'PUT',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    (createTickerRepository as jest.Mock).mockReturnValue({ update: mockUpdate });
  });

  it('name だけをリポジトリへ渡して更新する', async () => {
    mockUpdate.mockResolvedValue({
      TickerID: 'NSDQ:AAPL',
      Symbol: 'AAPL',
      Name: 'Apple Inc.',
      ExchangeID: 'NASDAQ',
      UpdatedAt: 1704067200000,
    });

    const response = await PUT(
      createRequest(JSON.stringify({ name: 'Apple Inc.', exchangeId: 'OTHER', symbol: 'X' })),
      makeParams('NSDQ:AAPL')
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('NSDQ:AAPL', { Name: 'Apple Inc.' });
  });

  it('更新内容がない場合はバリデーションの指摘を 400 で返す', async () => {
    const response = await PUT(createRequest('{}'), makeParams('NSDQ:AAPL'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('更新する内容を指定してください');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ...MALFORMED_BODY_CASES,
    ['name が数値', JSON.stringify({ name: 1 })],
    ['name が null', JSON.stringify({ name: null })],
  ])('異常系: %s の場合は 400 を返し、下流を呼ばず通報もしない', async (_label, rawBody) => {
    const response = await PUT(createRequest(rawBody), makeParams('NSDQ:AAPL'));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_REQUEST');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it('壊れた JSON の場合は専用のメッセージを返す', async () => {
    const response = await PUT(createRequest('{"name":'), makeParams('NSDQ:AAPL'));

    expect((await response.json()).message).toBe('リクエストボディが不正です');
  });
});

describe('DELETE /api/tickers/[id]', () => {
  const mockDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createTickerRepository as jest.Mock).mockReturnValue({ delete: mockDelete });
  });

  it('DynamoDB エラー時に reportErrorEvent が呼ばれる', async () => {
    mockDelete.mockRejectedValue(new Error('DynamoDB 削除エラー'));

    const request = new NextRequest('http://localhost/api/tickers/NSDQ:AAPL', {
      method: 'DELETE',
    });

    const response = await DELETE(request, makeParams('NSDQ:AAPL'));

    expect(response.status).toBe(500);
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: 'Web API: ティッカー削除エラー',
        message: expect.stringContaining('DynamoDB'),
      })
    );
    expect(awsModule.reportErrorEvent).toHaveBeenCalledTimes(1);
  });
});
