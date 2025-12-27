import { NextRequest } from 'next/server';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// 環境変数を最初に設定
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE = 'test-table';
process.env.S3_BUCKET = 'test-bucket';

import { POST } from './route';

// AWS SDK のモック
const dynamoMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

// getSignedUrl のモック
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://example.com/presigned-url'),
}));

// uuid のモック
jest.mock('uuid', () => ({
  v4: jest.fn(() => '550e8400-e29b-41d4-a716-446655440000'),
}));

describe('POST /api/jobs', () => {
  beforeEach(() => {
    // モックのリセット
    dynamoMock.reset();
    s3Mock.reset();
    jest.clearAllMocks();
  });

  it('有効なリクエストでジョブを作成し、Presigned URLを返す', async () => {
    // モックの設定
    dynamoMock.on(PutCommand).resolves({});
    s3Mock.on(PutObjectCommand).resolves({});

    // リクエストの作成
    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024, // 100MB
        contentType: 'video/mp4',
        outputCodec: 'h264',
      }),
    });

    // APIの実行
    const response = await POST(request);
    const data = await response.json();

    // レスポンスの検証
    expect(response.status).toBe(201);
    expect(data).toEqual({
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      uploadUrl: 'https://example.com/presigned-url',
      expiresIn: 3600,
    });

    // DynamoDBへの書き込みを検証
    expect(dynamoMock.calls()).toHaveLength(1);
    const putCall = dynamoMock.call(0);
    expect(putCall.args[0].input).toMatchObject({
      TableName: 'test-table',
      Item: {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'PENDING',
        inputFile: 'uploads/550e8400-e29b-41d4-a716-446655440000/input.mp4',
        outputCodec: 'h264',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
      },
    });
  });

  it('ファイルサイズが500MBを超える場合、400エラーを返す', async () => {
    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'large-video.mp4',
        fileSize: 600 * 1024 * 1024, // 600MB
        contentType: 'video/mp4',
        outputCodec: 'h264',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: 'INVALID_FILE_SIZE',
      message: 'ファイルサイズは500MB以下である必要があります',
    });

    // DynamoDBへの書き込みが行われていないことを確認
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('MIMEタイプがvideo/mp4でない場合、400エラーを返す', async () => {
    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'video.avi',
        fileSize: 100 * 1024 * 1024,
        contentType: 'video/avi',
        outputCodec: 'h264',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: 'INVALID_FILE_TYPE',
      message: 'MP4ファイルのみアップロード可能です',
    });

    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('ファイル拡張子がmp4でない場合、400エラーを返す', async () => {
    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'video.avi',
        fileSize: 100 * 1024 * 1024,
        contentType: 'video/mp4',
        outputCodec: 'h264',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_FILE_TYPE');
    expect(data.message).toBe('MP4ファイルのみアップロード可能です');

    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('必須フィールドが不足している場合、400エラーを返す', async () => {
    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.mp4',
        // fileSize が欠落
        contentType: 'video/mp4',
        outputCodec: 'h264',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: 'INVALID_REQUEST',
      message: '必須フィールドが不足しています',
    });

    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('無効なコーデックが指定された場合、400エラーを返す', async () => {
    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.mp4',
        fileSize: 100 * 1024 * 1024,
        contentType: 'video/mp4',
        outputCodec: 'invalid-codec',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: 'INVALID_CODEC',
      message: '無効なコーデックが指定されました',
    });

    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('DynamoDB書き込みエラー時、500エラーを返す', async () => {
    // DynamoDBのモックをエラーにする
    dynamoMock.on(PutCommand).rejects(new Error('DynamoDB Error'));

    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.mp4',
        fileSize: 100 * 1024 * 1024,
        contentType: 'video/mp4',
        outputCodec: 'h264',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの作成に失敗しました',
    });
  });

  it('vp9コーデックでジョブを作成できる', async () => {
    dynamoMock.on(PutCommand).resolves({});
    s3Mock.on(PutObjectCommand).resolves({});

    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.mp4',
        fileSize: 50 * 1024 * 1024,
        contentType: 'video/mp4',
        outputCodec: 'vp9',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.jobId).toBe('550e8400-e29b-41d4-a716-446655440000');

    const putCall = dynamoMock.call(0);
    expect(putCall.args[0].input.Item.outputCodec).toBe('vp9');
  });

  it('av1コーデックでジョブを作成できる', async () => {
    dynamoMock.on(PutCommand).resolves({});
    s3Mock.on(PutObjectCommand).resolves({});

    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.mp4',
        fileSize: 50 * 1024 * 1024,
        contentType: 'video/mp4',
        outputCodec: 'av1',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.jobId).toBe('550e8400-e29b-41d4-a716-446655440000');

    const putCall = dynamoMock.call(0);
    expect(putCall.args[0].input.Item.outputCodec).toBe('av1');
  });

  it('ファイルサイズが0の場合、400エラーを返す', async () => {
    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.mp4',
        fileSize: 0,
        contentType: 'video/mp4',
        outputCodec: 'h264',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('INVALID_FILE_SIZE');

    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('ファイルサイズが500MB（境界値）の場合、正常にジョブを作成できる', async () => {
    dynamoMock.on(PutCommand).resolves({});
    s3Mock.on(PutObjectCommand).resolves({});

    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.mp4',
        fileSize: 500 * 1024 * 1024, // 500MB (境界値)
        contentType: 'video/mp4',
        outputCodec: 'h264',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.jobId).toBeDefined();

    expect(dynamoMock.calls()).toHaveLength(1);
  });

  it('ファイル名に大文字拡張子（.MP4）を使用できる', async () => {
    dynamoMock.on(PutCommand).resolves({});
    s3Mock.on(PutObjectCommand).resolves({});

    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'TEST.MP4',
        fileSize: 100 * 1024 * 1024,
        contentType: 'video/mp4',
        outputCodec: 'h264',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.jobId).toBeDefined();
  });

  it('環境変数が未設定の場合でもデフォルト値で動作する', async () => {
    // 環境変数を一時的に削除
    const originalRegion = process.env.AWS_REGION;
    const originalTable = process.env.DYNAMODB_TABLE;
    const originalBucket = process.env.S3_BUCKET;

    delete process.env.AWS_REGION;
    delete process.env.DYNAMODB_TABLE;
    delete process.env.S3_BUCKET;

    dynamoMock.on(PutCommand).resolves({});
    s3Mock.on(PutObjectCommand).resolves({});

    const request = new NextRequest('http://localhost:3000/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.mp4',
        fileSize: 100 * 1024 * 1024,
        contentType: 'video/mp4',
        outputCodec: 'h264',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.jobId).toBeDefined();

    // 環境変数を復元
    process.env.AWS_REGION = originalRegion;
    process.env.DYNAMODB_TABLE = originalTable;
    process.env.S3_BUCKET = originalBucket;
  });
});
