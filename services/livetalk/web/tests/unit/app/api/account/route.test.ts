/**
 * @jest-environment node
 */
import { DELETE } from '@/app/api/account/route';
import { getSession } from '@/lib/server/session';
import { getAccountDeletionRepository } from '@/lib/server/repositories';
import type { AccountDeletionRepository } from '@nagiyu/livetalk-core';
import { ACCOUNT_ERROR_MESSAGES } from '@/app/api/account/constants';
import { reportErrorEvent } from '@nagiyu/aws';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({ getAccountDeletionRepository: jest.fn() }));
jest.mock('@nagiyu/aws', () => ({ reportErrorEvent: jest.fn().mockResolvedValue(null) }));

const mockReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetRepo = getAccountDeletionRepository as jest.MockedFunction<
  typeof getAccountDeletionRepository
>;

const session = {
  user: {
    id: 'u1',
    email: 'u@example.com',
    name: 'テストユーザー',
    roles: ['livetalk-user'],
  },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

const makeRepo = (over: Partial<AccountDeletionRepository> = {}): AccountDeletionRepository =>
  ({
    deleteAccount: jest.fn(async () => ({ deletedCount: 5, anonymizedCount: 1 })),
    ...over,
  }) as unknown as AccountDeletionRepository;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DELETE /api/account', () => {
  it('未認証は 401 を返す', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it('正常系: 200 かつ { deleted: true } を返す', async () => {
    mockGetSession.mockResolvedValueOnce(session);
    const repo = makeRepo();
    mockGetRepo.mockReturnValue(repo);

    const res = await DELETE();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ deleted: true });
  });

  it('正常系: deleteAccount が セッションのユーザー ID で呼ばれる', async () => {
    mockGetSession.mockResolvedValueOnce(session);
    const repo = makeRepo();
    mockGetRepo.mockReturnValue(repo);

    await DELETE();

    expect(repo.deleteAccount).toHaveBeenCalledWith('u1');
    expect(repo.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('正常系: レスポンスに anonymizedCount / deletedCount を含まない', async () => {
    mockGetSession.mockResolvedValueOnce(session);
    mockGetRepo.mockReturnValue(makeRepo());

    const res = await DELETE();
    const json = await res.json();

    expect(json).not.toHaveProperty('anonymizedCount');
    expect(json).not.toHaveProperty('deletedCount');
  });

  it('deleteAccount が throw した場合は 500 かつエラーレスポンスを返す', async () => {
    mockGetSession.mockResolvedValueOnce(session);
    const repo = makeRepo({
      deleteAccount: jest.fn(async () => {
        throw new Error('DynamoDB エラー');
      }),
    });
    mockGetRepo.mockReturnValue(repo);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await DELETE();
    consoleSpy.mockRestore();

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({
      error: 'DELETE_FAILED',
      message: ACCOUNT_ERROR_MESSAGES.DELETE_FAILED,
    });
    expect(mockReportErrorEvent).toHaveBeenCalledTimes(1);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'error',
        title: 'Web API: アカウント削除エラー',
        message: 'DynamoDB エラー',
      })
    );
  });
});
