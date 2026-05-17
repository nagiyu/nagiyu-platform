import { NextRequest } from 'next/server';
import { PUT, DELETE } from '../../../../app/api/tickers/[id]/route';
import { createTickerRepository } from '../../../../lib/repository-factory';
import * as awsModule from '@nagiyu/aws';

jest.mock('../../../../lib/repository-factory', () => ({
  createTickerRepository: jest.fn(),
}));

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
  handleApiError: jest.fn((error) => {
    throw error;
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

    await expect(PUT(undefined as never, request, makeParams('NSDQ:AAPL'))).rejects.toThrow();
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'stock-tracker', severity: 'error' })
    );
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

    await expect(DELETE(undefined as never, request, makeParams('NSDQ:AAPL'))).rejects.toThrow();
    expect(awsModule.reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'stock-tracker', severity: 'error' })
    );
  });
});
