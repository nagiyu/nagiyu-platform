/**
 * @jest-environment node
 */

import { reportErrorEvent } from '@nagiyu/aws';
import { GET } from '@/app/api/jobs/[jobId]/transcript/route';
import type { JobRepository } from '@nagiyu/quick-clip-core';
import { getS3Client } from '@/lib/server/aws';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/server/aws', () => ({
  getS3Client: jest.fn(() => ({})),
  getBucketName: jest.fn(() => 'test-bucket'),
}));

const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

const mockGetJob = jest.fn();
jest.mock('@nagiyu/quick-clip-core', () => ({
  ...jest.requireActual('@nagiyu/quick-clip-core'),
  createJobRepository: jest.fn().mockImplementation(
    () =>
      ({
        create: jest.fn(),
        getById: mockGetJob,
        updateBatchJobId: jest.fn(),
      }) as unknown as JobRepository
  ),
}));

describe('GET /api/jobs/[jobId]/transcript', () => {
  const mockedGetS3Client = getS3Client as jest.MockedFunction<typeof getS3Client>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetS3Client.mockReturnValue({
      send: mockS3Send,
    } as unknown as ReturnType<typeof getS3Client>);
  });

  const mockRequest = {} as Request;

  it('正常系: transcript.json が存在する場合は segments を返す', async () => {
    const segments = [
      { start: 0.0, end: 3.5, text: 'こんにちは' },
      { start: 3.5, end: 7.0, text: 'テストです' },
    ];
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'COMPLETED',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });
    mockS3Send.mockResolvedValue({
      Body: {
        transformToString: jest.fn().mockResolvedValue(JSON.stringify(segments)),
      },
    });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ segments });
  });

  it('正常系: Body が null の場合は空配列を返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'COMPLETED',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });
    mockS3Send.mockResolvedValue({ Body: null });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ segments: [] });
  });

  it('正常系: NoSuchKey の場合は 200 で空配列を返す（オプショナル扱い）', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'COMPLETED',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });
    mockS3Send.mockRejectedValue({ name: 'NoSuchKey', Code: 'NoSuchKey' });

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ segments: [] });
  });

  it('異常系: ジョブが存在しない場合は 404 を返す', async () => {
    mockGetJob.mockResolvedValue(null);

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'missing' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: 'JOB_NOT_FOUND',
      message: expect.any(String),
    });
  });

  it('異常系: S3 で予期しないエラーが発生した場合は 500 を返す', async () => {
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'COMPLETED',
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    });
    mockS3Send.mockRejectedValue(new Error('S3 接続エラー'));

    const response = await GET(mockRequest, {
      params: Promise.resolve({ jobId: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: '文字起こし情報の取得に失敗しました',
    });
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        title: 'Web API: 文字起こし取得エラー',
      })
    );
  });
});
