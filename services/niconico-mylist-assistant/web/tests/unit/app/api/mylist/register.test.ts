/**
 * @jest-environment node
 */

/**
 * POST /api/mylist/register のユニットテスト
 *
 * 認証・保存セッション取得・Batch 投入・DynamoDB 操作をモック化して API 境界を検証する。
 */

// モック：next-auth セッション
jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

// モック：ニコニコセッション管理ビジネスロジック
jest.mock('../../../../../src/lib/niconico-session', () => ({
  getEncryptedUserSessionBlob: jest.fn(),
}));

// モック：niconico-mylist-assistant-core（動画選択・バッチジョブ作成）
jest.mock('@nagiyu/niconico-mylist-assistant-core', () => ({
  selectRandomVideos: jest.fn(),
  createBatchJob: jest.fn(),
}));

// モック：@nagiyu/aws（Batch クライアント・エラーレポート）
jest.mock('@nagiyu/aws', () => ({
  getBatchClient: jest.fn(),
  reportErrorEvent: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '../../../../../src/app/api/mylist/register/route';
import { getSession } from '../../../../../src/lib/auth/session';
import { getEncryptedUserSessionBlob } from '../../../../../src/lib/niconico-session';
import { selectRandomVideos, createBatchJob } from '@nagiyu/niconico-mylist-assistant-core';
import { getBatchClient } from '@nagiyu/aws';
import type { VideoBasicInfo, UserVideoSetting } from '@nagiyu/niconico-mylist-assistant-core';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetEncryptedUserSessionBlob = getEncryptedUserSessionBlob as jest.MockedFunction<
  typeof getEncryptedUserSessionBlob
>;
const mockSelectRandomVideos = selectRandomVideos as jest.MockedFunction<typeof selectRandomVideos>;
const mockCreateBatchJob = createBatchJob as jest.MockedFunction<typeof createBatchJob>;
const mockGetBatchClient = getBatchClient as jest.MockedFunction<typeof getBatchClient>;

/** 認証済みセッションのモック */
const MOCK_SESSION = {
  user: { userId: 'user123', email: 'test@example.com', name: 'テストユーザー', roles: [] },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

/** 保存済み暗号化ブロブのモック */
const SAMPLE_ENCRYPTED_BLOB = JSON.stringify({
  ciphertext: 'dummyCiphertext',
  iv: 'dummyIv',
  authTag: 'dummyAuthTag',
});

/** selectRandomVideos の戻り値型に合わせた動画モック */
type SelectRandomVideosResult = Array<VideoBasicInfo & { userSetting?: UserVideoSetting }>;

function makeMockVideos(ids: string[]): SelectRandomVideosResult {
  return ids.map((videoId) => ({
    videoId,
    title: `動画 ${videoId}`,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    length: '5:00',
    CreatedAt: 1700000000000,
  }));
}

/** BatchJobEntity のモック（型チェック用インライン定義） */
const MOCK_BATCH_JOB_ENTITY = {
  jobId: 'job-001',
  userId: 'user123',
  status: 'SUBMITTED' as const,
  CreatedAt: 1700000000000,
  UpdatedAt: 1700000000000,
};

/** JSON ボディ付き NextRequest を生成するヘルパー */
function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/mylist/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Batch クライアントの send モックを設定するヘルパー */
function setupBatchClientMock(options: { jobId?: string } = { jobId: 'test-job-id' }) {
  const mockSend = jest.fn().mockResolvedValue({ jobId: options.jobId });
  mockGetBatchClient.mockReturnValue({ send: mockSend } as unknown as ReturnType<
    typeof getBatchClient
  >);
  return mockSend;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/mylist/register', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const request = makePostRequest({ maxCount: 10, mylistName: 'テストマイリスト' });
    const response = await POST(request);
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error).toBe('UNAUTHORIZED');
  });

  it('保存セッションが未登録の場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(null);

    const request = makePostRequest({ maxCount: 10, mylistName: 'テストマイリスト' });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('SESSION_NOT_REGISTERED');
  });

  it('保存セッションがある場合にバッチジョブ投入が呼ばれる', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);
    mockSelectRandomVideos.mockResolvedValue(makeMockVideos(['sm1', 'sm2']));
    const mockSend = setupBatchClientMock({ jobId: 'job-001' });
    mockCreateBatchJob.mockResolvedValue({ ...MOCK_BATCH_JOB_ENTITY, jobId: 'job-001' });

    const request = makePostRequest({ maxCount: 10, mylistName: 'テストマイリスト' });
    const response = await POST(request);
    expect(response.status).toBe(200);

    // Batch submit が呼ばれた
    expect(mockSend).toHaveBeenCalledTimes(1);

    const json = await response.json();
    expect(json.jobId).toBe('job-001');
    expect(json.selectedCount).toBe(2);
    expect(typeof json.message).toBe('string');
  });

  it('maxCount が数値でない場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);

    const request = makePostRequest({ maxCount: 'ten', mylistName: 'テストマイリスト' });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INVALID_REQUEST');
  });

  it('maxCount が整数でない場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);

    const request = makePostRequest({ maxCount: 1.5, mylistName: 'テストマイリスト' });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INVALID_REQUEST');
  });

  it('maxCount が範囲外の場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);

    const request = makePostRequest({ maxCount: 101, mylistName: 'テストマイリスト' });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INVALID_REQUEST');
  });

  it('mylistName が未指定の場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);

    const request = makePostRequest({ maxCount: 10 });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INVALID_REQUEST');
  });

  it('mylistName が文字列でない場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);

    // JSON では数値として渡す（型チェックの後段で文字列チェック）
    const request = makePostRequest({ maxCount: 10, mylistName: 12345 });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INVALID_REQUEST');
  });

  it('動画が 0 件の場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);
    mockSelectRandomVideos.mockResolvedValue([]);
    setupBatchClientMock();

    const request = makePostRequest({ maxCount: 10, mylistName: 'テストマイリスト' });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('NO_VIDEOS');
  });

  it('selectRandomVideos で DynamoDB エラーが発生した場合は 500 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);
    // DynamoDB エラー名を持つエラーを模倣
    const dbError = new Error('DynamoDB error');
    dbError.name = 'ResourceNotFoundException';
    mockSelectRandomVideos.mockRejectedValue(dbError);
    setupBatchClientMock();

    const request = makePostRequest({ maxCount: 10, mylistName: 'テストマイリスト' });
    const response = await POST(request);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('DATABASE_ERROR');
  });

  it('Batch jobId が返らない場合は 500 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);
    mockSelectRandomVideos.mockResolvedValue(makeMockVideos(['sm10']));
    // jobId が undefined として返す（空オブジェクトを渡して jobId を省略）
    setupBatchClientMock({});
    const { reportErrorEvent } = jest.requireMock('@nagiyu/aws') as {
      reportErrorEvent: jest.Mock;
    };
    reportErrorEvent.mockResolvedValue(undefined);

    const request = makePostRequest({ maxCount: 5, mylistName: 'ジョブID未取得テスト' });
    const response = await POST(request);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('BATCH_ERROR');
  });

  it('createBatchJob が失敗した場合は 500 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);
    mockSelectRandomVideos.mockResolvedValue(makeMockVideos(['sm20']));
    setupBatchClientMock({ jobId: 'job-003' });
    mockCreateBatchJob.mockRejectedValue(new Error('DynamoDB書き込み失敗'));
    const { reportErrorEvent } = jest.requireMock('@nagiyu/aws') as {
      reportErrorEvent: jest.Mock;
    };
    reportErrorEvent.mockResolvedValue(undefined);

    const request = makePostRequest({ maxCount: 5, mylistName: 'DynamoDB失敗テスト' });
    const response = await POST(request);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('DATABASE_ERROR');
  });

  it('Batch 投入で予期しない例外が発生した場合は 500 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);
    mockSelectRandomVideos.mockResolvedValue(makeMockVideos(['sm30']));
    // Batch クライアント自体が例外を投げる
    const mockSend = jest.fn().mockRejectedValue(new Error('Batch 接続エラー'));
    mockGetBatchClient.mockReturnValue({ send: mockSend } as unknown as ReturnType<
      typeof getBatchClient
    >);
    const { reportErrorEvent } = jest.requireMock('@nagiyu/aws') as {
      reportErrorEvent: jest.Mock;
    };
    reportErrorEvent.mockResolvedValue(undefined);

    const request = makePostRequest({ maxCount: 5, mylistName: '予期しない例外テスト' });
    const response = await POST(request);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('BATCH_ERROR');
  });

  it('ENCRYPTED_USER_SESSION ブロブが containerOverrides に渡される', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetEncryptedUserSessionBlob.mockResolvedValue(SAMPLE_ENCRYPTED_BLOB);
    mockSelectRandomVideos.mockResolvedValue(makeMockVideos(['sm3']));
    const mockSend = setupBatchClientMock({ jobId: 'job-002' });
    mockCreateBatchJob.mockResolvedValue({ ...MOCK_BATCH_JOB_ENTITY, jobId: 'job-002' });

    const request = makePostRequest({ maxCount: 5, mylistName: 'ブロブ検証' });
    const response = await POST(request);
    expect(response.status).toBe(200);

    // SubmitJobCommand に ENCRYPTED_USER_SESSION が含まれることを確認
    const sendCallArgs = mockSend.mock.calls[0][0] as {
      input: {
        containerOverrides: {
          environment: Array<{ name: string; value: string }>;
        };
      };
    };
    const env = sendCallArgs.input.containerOverrides.environment;
    const encryptedEnv = env.find((e) => e.name === 'ENCRYPTED_USER_SESSION');
    expect(encryptedEnv?.value).toBe(SAMPLE_ENCRYPTED_BLOB);
  });
});
