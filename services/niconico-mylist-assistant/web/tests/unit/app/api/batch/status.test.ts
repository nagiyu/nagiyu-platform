/**
 * @jest-environment node
 */

/**
 * GET /api/batch/status/[jobId] のユニットテスト
 *
 * 認証だけをモック化し、リポジトリは core の InMemory 実装を実際に使う。
 * USE_IN_MEMORY_DB による実装の切り替えがこのルートにも効くことを確かめる。
 */

Object.assign(process.env, { USE_IN_MEMORY_DB: 'true', DYNAMODB_TABLE_NAME: 'test-table' });

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { createBatchJob, updateBatchJob } from '@nagiyu/niconico-mylist-assistant-core';
import { GET } from '../../../../../src/app/api/batch/status/[jobId]/route';
import { getSession } from '../../../../../src/lib/auth/session';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;

const MOCK_SESSION = {
  user: { id: 'user123', email: 'test@example.com', name: 'テストユーザー', roles: [] },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

function callGet(jobId: string) {
  return GET(new NextRequest(`http://localhost/api/batch/status/${jobId}`), {
    params: Promise.resolve({ jobId }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/batch/status/[jobId]', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await callGet('job-unauthorized');

    expect(response.status).toBe(401);
  });

  it('ジョブが存在しない場合は 404 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await callGet('job-missing');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'バッチジョブが見つかりません' },
    });
  });

  it('作成直後のジョブは ISO 8601 の日時付きで 200 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    const created = await createBatchJob({
      jobId: 'job-submitted',
      userId: 'user123',
      status: 'SUBMITTED',
    });

    const response = await callGet('job-submitted');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      jobId: 'job-submitted',
      status: 'SUBMITTED',
      createdAt: new Date(created.createdAt).toISOString(),
      updatedAt: new Date(created.updatedAt).toISOString(),
    });
  });

  it('完了したジョブは結果と完了日時を含めて返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    await createBatchJob({ jobId: 'job-done', userId: 'user123', status: 'SUBMITTED' });
    const completedAt = 1704067300000;
    await updateBatchJob('job-done', 'user123', {
      status: 'SUCCEEDED',
      result: { registeredCount: 2, failedCount: 1, totalCount: 3 },
      completedAt,
    });

    const response = await callGet('job-done');

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      jobId: 'job-done',
      status: 'SUCCEEDED',
      result: { registeredCount: 2, failedCount: 1, totalCount: 3 },
      completedAt: new Date(completedAt).toISOString(),
    });
    // 二段階認証コードなど内部の項目はレスポンスに含めない
    expect(json).not.toHaveProperty('twoFactorAuthCode');
    expect(json).not.toHaveProperty('userId');
  });

  it('他のユーザーのジョブは 404 を返す', async () => {
    mockGetSession.mockResolvedValue({
      ...MOCK_SESSION,
      user: { ...MOCK_SESSION.user, id: 'other-user' },
    });
    await createBatchJob({ jobId: 'job-other', userId: 'user123', status: 'SUBMITTED' });

    const response = await callGet('job-other');

    expect(response.status).toBe(404);
  });
});
