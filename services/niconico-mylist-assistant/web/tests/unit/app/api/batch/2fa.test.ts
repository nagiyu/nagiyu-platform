/**
 * @jest-environment node
 */

/**
 * POST /api/batch/2fa のユニットテスト
 *
 * 認証・バッチジョブのリポジトリをモック化して、ボディの検証と登録内容を検証する。
 */

// モック：next-auth セッション
jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

// モック：niconico-mylist-assistant-core（DB 操作）。正規表現は本物と同じ定義を使う
jest.mock('@nagiyu/niconico-mylist-assistant-core', () => ({
  updateBatchJob: jest.fn(),
  getBatchJob: jest.fn(),
  TWO_FACTOR_AUTH_CODE_REGEX: /^\d{6}$/,
}));

// モック: @nagiyu/aws (エラー報告)
jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn(),
  createErrorReporter: jest.fn(() => ({ report: jest.fn(), onError: jest.fn(() => jest.fn()) })),
}));

import { NextRequest } from 'next/server';
import { POST } from '../../../../../src/app/api/batch/2fa/route';
import { reportErrorEvent } from '@nagiyu/aws';
import { getSession } from '../../../../../src/lib/auth/session';
import { updateBatchJob, getBatchJob } from '@nagiyu/niconico-mylist-assistant-core';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockUpdateBatchJob = updateBatchJob as jest.MockedFunction<typeof updateBatchJob>;
const mockGetBatchJob = getBatchJob as jest.MockedFunction<typeof getBatchJob>;

/** 認証済みセッションのモック */
const MOCK_SESSION = {
  user: { id: 'user123', email: 'test@example.com', name: 'テストユーザー', roles: [] },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

/** 本文の文字列をそのまま持つ NextRequest を生成するヘルパー */
function makeRawRequest(rawBody: string): NextRequest {
  return new NextRequest('http://localhost/api/batch/2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

/** JSON ボディ付き NextRequest を生成するヘルパー */
function makePostRequest(body: unknown): NextRequest {
  return makeRawRequest(JSON.stringify(body));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/batch/2fa', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(makePostRequest({ jobId: 'job-1', code: '123456' }));
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error.code).toBe('UNAUTHORIZED');
    expect(mockGetBatchJob).not.toHaveBeenCalled();
  });

  it.each([
    ['jobId が未指定', { code: '123456' }],
    ['code が未指定', { jobId: 'job-1' }],
    ['jobId が空文字', { jobId: '', code: '123456' }],
  ])('%s の場合は 400 を返す', async (_label, body) => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await POST(makePostRequest(body));
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe('INVALID_REQUEST');
    expect(mockGetBatchJob).not.toHaveBeenCalled();
  });

  it('コードが 6 桁の数字でない場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await POST(makePostRequest({ jobId: 'job-1', code: '12345' }));
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe('INVALID_CODE');
    expect(mockGetBatchJob).not.toHaveBeenCalled();
  });

  it('ジョブが存在しない場合は 404 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetBatchJob.mockResolvedValue(null);

    const response = await POST(makePostRequest({ jobId: 'job-1', code: '123456' }));
    expect(response.status).toBe(404);
    expect(mockUpdateBatchJob).not.toHaveBeenCalled();
  });

  it('ジョブが二段階認証待ちでない場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetBatchJob.mockResolvedValue({ status: 'RUNNING' } as Awaited<
      ReturnType<typeof getBatchJob>
    >);

    const response = await POST(makePostRequest({ jobId: 'job-1', code: '123456' }));
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe('INVALID_STATUS');
    expect(mockUpdateBatchJob).not.toHaveBeenCalled();
  });

  it('二段階認証待ちのジョブにコードを登録する', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetBatchJob.mockResolvedValue({
      status: 'WAITING_FOR_2FA',
    } as Awaited<ReturnType<typeof getBatchJob>>);

    const response = await POST(makePostRequest({ jobId: 'job-1', code: '123456' }));
    expect(response.status).toBe(200);

    expect(mockGetBatchJob).toHaveBeenCalledWith('job-1', 'user123');
    expect(mockUpdateBatchJob).toHaveBeenCalledWith('job-1', 'user123', {
      status: 'WAITING_FOR_2FA',
      twoFactorAuthCode: '123456',
    });
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it('DB 例外時は 500 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetBatchJob.mockRejectedValue(new Error('DB 接続失敗'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(makePostRequest({ jobId: 'job-1', code: '123456' }));
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error.code).toBe('DATABASE_ERROR');
    expect(reportErrorEvent).toHaveBeenCalledTimes(1);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'niconico-mylist-assistant',
        title: 'Web API: 二段階認証コード登録エラー',
      })
    );
  });

  it.each([
    ['壊れた JSON', 'this is not json{'],
    ['空の本文', ''],
    ['null', 'null'],
    ['配列', '[{"jobId":"job-1","code":"123456"}]'],
  ])('本文が %s の場合は 400 を返し、下流を呼ばない', async (_label, rawBody) => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await POST(makeRawRequest(rawBody));
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe('INVALID_REQUEST');
    expect(json.error.message).toBe('リクエストボディが不正です');
    expect(mockGetBatchJob).not.toHaveBeenCalled();
    expect(mockUpdateBatchJob).not.toHaveBeenCalled();
  });

  it.each([
    ['jobId が数値', { jobId: 123, code: '123456' }, 'INVALID_REQUEST'],
    ['jobId がオブジェクト', { jobId: { id: 'job-1' }, code: '123456' }, 'INVALID_REQUEST'],
    ['code が数値', { jobId: 'job-1', code: 123456 }, 'INVALID_CODE'],
    ['code が配列', { jobId: 'job-1', code: ['123456'] }, 'INVALID_CODE'],
  ])('%s の場合は 400 を返し、下流を呼ばない', async (_label, body, code) => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await POST(makePostRequest(body));
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error.code).toBe(code);
    expect(mockGetBatchJob).not.toHaveBeenCalled();
    expect(mockUpdateBatchJob).not.toHaveBeenCalled();
  });
});
