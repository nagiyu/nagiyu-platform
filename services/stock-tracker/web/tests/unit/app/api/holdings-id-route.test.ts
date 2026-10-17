import { NextRequest } from 'next/server';
import * as awsModule from '@nagiyu/aws';
import { DELETE, PUT } from '../../../../app/api/holdings/[id]/route';
import {
  createHoldingRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';
import { MALFORMED_BODY_CASES } from './invalidBodyCases';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../../lib/repository-factory', () => ({
  createHoldingRepository: jest.fn(),
  createTickerRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

// エラー変換などは実物を使い、withAuth だけを差し替える
jest.mock('@nagiyu/nextjs', () => ({
  ...jest.requireActual('@nagiyu/nextjs'),
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { id: 'test-user' } }, ...args);
  }),
}));

describe('PUT /api/holdings/[id]', () => {
  const mockUpdate = jest.fn();
  const mockGetTickerById = jest.fn();

  const holdingId = 'test-user#NSDQ:AAPL';

  const createRequest = (rawBody: string) =>
    new NextRequest('http://localhost/api/holdings/test-user%23NSDQ%3AAAPL', {
      method: 'PUT',
      body: rawBody,
      headers: { 'content-type': 'application/json' },
    });

  const createParams = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    jest.clearAllMocks();
    (createHoldingRepository as jest.Mock).mockReturnValue({ update: mockUpdate });
    (createTickerRepository as jest.Mock).mockReturnValue({ getById: mockGetTickerById });
  });

  it('更新対象の項目だけをリポジトリへ渡す', async () => {
    mockUpdate.mockResolvedValue({
      userId: 'test-user',
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NSDQ',
      quantity: 20,
      averagePrice: 160,
      currency: 'USD',
      createdAt: 1704067200000,
      updatedAt: 1704067200000,
    });
    mockGetTickerById.mockResolvedValue({ symbol: 'AAPL', name: 'Apple Inc.' });

    const response = await PUT(
      createRequest(
        JSON.stringify({
          quantity: 20,
          averagePrice: 160,
          currency: 'USD',
          userId: 'other-user',
          exchangeId: 'OTHER',
        })
      ),
      createParams(holdingId)
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('test-user', 'NSDQ:AAPL', {
      quantity: 20,
      averagePrice: 160,
      currency: 'USD',
    });
  });

  it('対象の保有株式が存在しない場合は 404 を返し、通報しない', async () => {
    mockUpdate.mockRejectedValue(
      new awsModule.EntityNotFoundError('Holding', 'test-user#NSDQ:AAPL')
    );

    const response = await PUT(
      createRequest(JSON.stringify({ quantity: 20 })),
      createParams(holdingId)
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('NOT_FOUND');
    expect(body.message).toBe('保有株式が見つかりません');
    expect(mockGetTickerById).not.toHaveBeenCalled();
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it('更新する項目がない場合は 400 を返す', async () => {
    const response = await PUT(createRequest('{}'), createParams(holdingId));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_REQUEST');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ...MALFORMED_BODY_CASES,
    ['quantity が文字列', JSON.stringify({ quantity: '10' })],
    ['quantity が null', JSON.stringify({ quantity: null })],
    ['averagePrice が文字列', JSON.stringify({ averagePrice: '150.5' })],
    ['averagePrice が配列', JSON.stringify({ averagePrice: [150.5] })],
    ['currency が数値', JSON.stringify({ currency: 1 })],
    ['currency が null', JSON.stringify({ currency: null })],
  ])('異常系: %s の場合は 400 を返し、下流を呼ばない', async (_label, rawBody) => {
    const response = await PUT(createRequest(rawBody), createParams(holdingId));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_REQUEST');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockGetTickerById).not.toHaveBeenCalled();
  });

  it('壊れた JSON の場合は専用のメッセージを返す', async () => {
    const response = await PUT(createRequest('{"quantity":'), createParams(holdingId));

    expect((await response.json()).message).toBe('リクエストボディが不正です');
  });

  it('項目の型違いの場合は入力データ不正のメッセージを返す', async () => {
    const response = await PUT(
      createRequest(JSON.stringify({ quantity: '10' })),
      createParams(holdingId)
    );

    expect((await response.json()).message).toBe('入力データが不正です');
  });
});

describe('DELETE /api/holdings/[id]', () => {
  const mockDelete = jest.fn();

  const holdingId = 'test-user#NSDQ:AAPL';

  const createRequest = () =>
    new NextRequest('http://localhost/api/holdings/test-user%23NSDQ%3AAAPL', {
      method: 'DELETE',
    });

  const createParams = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    jest.clearAllMocks();
    (createHoldingRepository as jest.Mock).mockReturnValue({ delete: mockDelete });
  });

  it('保有株式を削除し、削除した ID を返す', async () => {
    mockDelete.mockResolvedValue(undefined);

    const response = await DELETE(createRequest(), createParams(holdingId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, deletedHoldingId: holdingId });
    expect(mockDelete).toHaveBeenCalledWith('test-user', 'NSDQ:AAPL');
  });

  it('対象の保有株式が存在しない場合は 404 を返し、通報しない', async () => {
    mockDelete.mockRejectedValue(
      new awsModule.EntityNotFoundError('Holding', 'test-user#NSDQ:AAPL')
    );

    const response = await DELETE(createRequest(), createParams(holdingId));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('NOT_FOUND');
    expect(body.message).toBe('保有株式が見つかりません');
    expect(awsModule.reportErrorEvent).not.toHaveBeenCalled();
  });

  it('他のユーザーの保有株式は 403 を返し、削除しない', async () => {
    const response = await DELETE(createRequest(), createParams('other-user#NSDQ:AAPL'));

    expect(response.status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
