import { POST } from '../../../../app/api/summaries/refresh/route';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

jest.mock('../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { roles: ['stock-admin'] } }, ...args);
  }),
}));

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: mockSend })),
  InvokeCommand: jest.fn((input) => ({ input })),
}));

describe('POST /api/summaries/refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STOCK_TRACKER_SUMMARY_BATCH_FUNCTION_NAME;
    process.env.NODE_ENV = 'dev';
  });

  it('正常系: サマリーバッチを非同期実行する', async () => {
    mockSend.mockResolvedValue({});

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(LambdaClient).toHaveBeenCalled();
    expect(InvokeCommand).toHaveBeenCalledWith({
      FunctionName: 'nagiyu-stock-tracker-batch-summary-dev',
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({ source: 'stock-tracker-web' })),
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ message: 'サマリーバッチの実行を開始しました' });
  });

  it('正常系: 環境変数で指定した関数名を優先する', async () => {
    process.env.STOCK_TRACKER_SUMMARY_BATCH_FUNCTION_NAME = 'custom-summary-function';
    mockSend.mockResolvedValue({});

    const response = await POST();

    expect(response.status).toBe(202);
    expect(InvokeCommand).toHaveBeenCalledWith({
      FunctionName: 'custom-summary-function',
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({ source: 'stock-tracker-web' })),
    });
  });

  it('異常系: 実行に失敗した場合は500を返す', async () => {
    mockSend.mockRejectedValue(new Error('invoke failed'));

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'サマリーバッチの実行に失敗しました',
    });
  });
});
