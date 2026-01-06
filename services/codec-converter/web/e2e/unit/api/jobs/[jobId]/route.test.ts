import { NextRequest } from 'next/server';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// 環境変数を最初に設定
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE = 'test-table';
process.env.S3_BUCKET = 'test-bucket';

import { GET } from '../../../../../src/app/api/jobs/[jobId]/route';
import { clearAwsClientsCache } from '../../../../../src/lib/aws-clients';

// AWS SDK のモック
const dynamoMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

// getSignedUrl のモック
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));
const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

describe('GET /api/jobs/{jobId}', () => {
  beforeEach(() => {
    // モックのリセット
    dynamoMock.reset();
    s3Mock.reset();
    jest.clearAllMocks();
    // AWSクライアントキャッシュのクリア
    clearAwsClientsCache();
  });

  it('正常系: PENDING状態のジョブを取得する', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

    // DynamoDB GetCommand のモック
    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'PENDING',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputCodec: 'h264',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067200,
        expiresAt: 1704153600,
      },
    });

    // リクエストの作成
    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'GET',
    });
    const params = Promise.resolve({ jobId });

    // APIの実行
    const response = await GET(request, { params });
    const data = await response.json();

    // レスポンスの検証
    expect(response.status).toBe(200);
    expect(data).toEqual({
      jobId,
      status: 'PENDING',
      inputFile: `uploads/${jobId}/input.mp4`,
      outputCodec: 'h264',
      fileName: 'test-video.mp4',
      fileSize: 100 * 1024 * 1024,
      createdAt: 1704067200,
      updatedAt: 1704067200,
      expiresAt: 1704153600,
    });

    // downloadUrlが含まれていないことを確認
    expect(data.downloadUrl).toBeUndefined();

    // DynamoDBへのGetCommand呼び出しを検証
    expect(dynamoMock.commandCalls(GetCommand)).toHaveLength(1);
    const getCall = dynamoMock.call(0);
    expect(getCall.args[0].input).toMatchObject({
      TableName: 'test-table',
      Key: { jobId },
    });

    // getSignedUrlが呼ばれていないことを確認
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('正常系: PROCESSING状態のジョブを取得する', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440001';

    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'PROCESSING',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputCodec: 'vp9',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067400,
        expiresAt: 1704153600,
      },
    });

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'GET',
    });
    const params = Promise.resolve({ jobId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('PROCESSING');
    expect(data.downloadUrl).toBeUndefined();
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('正常系: COMPLETED状態のジョブでdownloadUrlを返す', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440002';
    const outputFile = `outputs/${jobId}/output.mp4`;
    const mockDownloadUrl = `https://test-bucket.s3.amazonaws.com/${outputFile}?signature=abc123`;

    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'COMPLETED',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputFile,
        outputCodec: 'h264',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067800,
        expiresAt: 1704153600,
      },
    });

    // getSignedUrl のモック
    mockedGetSignedUrl.mockResolvedValue(mockDownloadUrl);

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'GET',
    });
    const params = Promise.resolve({ jobId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      jobId,
      status: 'COMPLETED',
      inputFile: `uploads/${jobId}/input.mp4`,
      outputFile,
      outputCodec: 'h264',
      fileName: 'test-video.mp4',
      fileSize: 100 * 1024 * 1024,
      createdAt: 1704067200,
      updatedAt: 1704067800,
      expiresAt: 1704153600,
      downloadUrl: mockDownloadUrl,
    });

    // getSignedUrlが正しいパラメータで呼ばれたことを確認
    expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
    const [s3Client, command, options] = mockedGetSignedUrl.mock.calls[0];
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: outputFile,
    });
    expect(options).toEqual({ expiresIn: 86400 }); // 24時間
  });

  it('正常系: COMPLETED状態でoutputFileがない場合、downloadUrlを含めない', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440003';

    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'COMPLETED',
        inputFile: `uploads/${jobId}/input.mp4`,
        // outputFileなし
        outputCodec: 'h264',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067800,
        expiresAt: 1704153600,
      },
    });

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'GET',
    });
    const params = Promise.resolve({ jobId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('COMPLETED');
    expect(data.downloadUrl).toBeUndefined();
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('正常系: FAILED状態のジョブでエラーメッセージを含む', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440004';

    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'FAILED',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputCodec: 'av1',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067800,
        expiresAt: 1704153600,
        errorMessage: 'FFmpegがエラーを返しました',
      },
    });

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'GET',
    });
    const params = Promise.resolve({ jobId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('FAILED');
    expect(data.errorMessage).toBe('FFmpegがエラーを返しました');
    expect(data.downloadUrl).toBeUndefined();
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('異常系: ジョブが存在しない場合、404エラーを返す', async () => {
    const jobId = 'non-existent-job-id';

    // DynamoDB GetCommand のモック（ジョブなし）
    dynamoMock.on(GetCommand).resolves({});

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'GET',
    });
    const params = Promise.resolve({ jobId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({
      error: 'JOB_NOT_FOUND',
      message: '指定されたジョブが見つかりません',
    });

    expect(dynamoMock.commandCalls(GetCommand)).toHaveLength(1);
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('異常系: DynamoDBエラー時、500エラーを返す', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440005';

    // DynamoDB GetCommand のモック（エラー）
    dynamoMock.on(GetCommand).rejects(new Error('DynamoDB Error'));

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'GET',
    });
    const params = Promise.resolve({ jobId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの取得に失敗しました',
    });

    expect(dynamoMock.commandCalls(GetCommand)).toHaveLength(1);
  });

  it('異常系: getSignedUrl エラー時、500エラーを返す', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440006';

    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'COMPLETED',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputFile: `outputs/${jobId}/output.mp4`,
        outputCodec: 'h264',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067800,
        expiresAt: 1704153600,
      },
    });

    // getSignedUrl のモック（エラー）
    mockedGetSignedUrl.mockRejectedValue(new Error('S3 Presigned URL Error'));

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'GET',
    });
    const params = Promise.resolve({ jobId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの取得に失敗しました',
    });
  });

  it('正常系: 環境変数がデフォルト値で動作する', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440007';

    // 環境変数を一時的に削除
    const originalRegion = process.env.AWS_REGION;
    const originalTable = process.env.DYNAMODB_TABLE;
    const originalBucket = process.env.S3_BUCKET;

    delete process.env.AWS_REGION;
    delete process.env.DYNAMODB_TABLE;
    delete process.env.S3_BUCKET;

    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'PENDING',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputCodec: 'h264',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067200,
        expiresAt: 1704153600,
      },
    });

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'GET',
    });
    const params = Promise.resolve({ jobId });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('PENDING');

    // 環境変数を復元
    process.env.AWS_REGION = originalRegion;
    process.env.DYNAMODB_TABLE = originalTable;
    process.env.S3_BUCKET = originalBucket;
  });

  it('正常系: 各コーデックタイプでジョブを取得できる', async () => {
    const codecs = ['h264', 'vp9', 'av1'] as const;

    for (const codec of codecs) {
      const jobId = `job-${codec}`;

      dynamoMock.on(GetCommand).resolves({
        Item: {
          jobId,
          status: 'PENDING',
          inputFile: `uploads/${jobId}/input.mp4`,
          outputCodec: codec,
          fileName: 'test-video.mp4',
          fileSize: 100 * 1024 * 1024,
          createdAt: 1704067200,
          updatedAt: 1704067200,
          expiresAt: 1704153600,
        },
      });

      const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
        method: 'GET',
      });
      const params = Promise.resolve({ jobId });

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.outputCodec).toBe(codec);

      dynamoMock.reset();
    }
  });
});
