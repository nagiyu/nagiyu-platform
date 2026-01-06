import { NextRequest } from 'next/server';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { BatchClient, SubmitJobCommand } from '@aws-sdk/client-batch';

// 環境変数を最初に設定
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE = 'test-table';
process.env.S3_BUCKET = 'test-bucket';
process.env.BATCH_JOB_QUEUE = 'test-queue';
process.env.BATCH_JOB_DEFINITION = 'test-job-definition';

import { POST } from '../../../../../../src/app/api/jobs/[jobId]/submit/route';

// AWS SDK のモック
const dynamoMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const batchMock = mockClient(BatchClient);

describe('POST /api/jobs/{jobId}/submit', () => {
  beforeEach(() => {
    // モックのリセット
    dynamoMock.reset();
    s3Mock.reset();
    batchMock.reset();
    jest.clearAllMocks();
  });

  it('正常系: Batchジョブを投入し、ステータスをPROCESSINGに更新する', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

    // DynamoDB GetCommand のモック（PENDING状態のジョブ）
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

    // S3 HeadObjectCommand のモック（ファイル存在）
    s3Mock.on(HeadObjectCommand).resolves({});

    // Batch SubmitJobCommand のモック
    batchMock.on(SubmitJobCommand).resolves({
      jobId: 'batch-job-id',
      jobName: `codec-converter-${jobId}`,
    });

    // DynamoDB UpdateCommand のモック
    dynamoMock.on(UpdateCommand).resolves({});

    // リクエストの作成
    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    // APIの実行
    const response = await POST(request, { params });
    const data = await response.json();

    // レスポンスの検証
    expect(response.status).toBe(200);
    expect(data).toEqual({
      jobId,
      status: 'PROCESSING',
    });

    // DynamoDBへのGetCommand呼び出しを検証
    expect(dynamoMock.commandCalls(GetCommand)).toHaveLength(1);
    const getCall = dynamoMock.call(0);
    expect(getCall.args[0].input).toMatchObject({
      TableName: 'test-table',
      Key: { jobId },
    });

    // S3へのHeadObjectCommand呼び出しを検証
    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(1);
    const headCall = s3Mock.call(0);
    expect(headCall.args[0].input).toMatchObject({
      Bucket: 'test-bucket',
      Key: `uploads/${jobId}/input.mp4`,
    });

    // BatchへのSubmitJobCommand呼び出しを検証
    expect(batchMock.commandCalls(SubmitJobCommand)).toHaveLength(1);
    const submitCall = batchMock.call(0);
    expect(submitCall.args[0].input).toMatchObject({
      jobName: `codec-converter-${jobId}`,
      jobQueue: 'test-queue',
      jobDefinition: 'test-job-definition',
      containerOverrides: {
        environment: [
          { name: 'JOB_ID', value: jobId },
          { name: 'OUTPUT_CODEC', value: 'h264' },
          { name: 'DYNAMODB_TABLE', value: 'test-table' },
          { name: 'S3_BUCKET', value: 'test-bucket' },
          { name: 'AWS_REGION', value: 'us-east-1' },
        ],
      },
    });

    // DynamoDBへのUpdateCommand呼び出しを検証
    expect(dynamoMock.commandCalls(UpdateCommand)).toHaveLength(1);
    const updateCall = dynamoMock.call(1);
    expect(updateCall.args[0].input).toMatchObject({
      TableName: 'test-table',
      Key: { jobId },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'PROCESSING',
        ':updatedAt': expect.any(Number),
      },
    });
  });

  it('異常系: ジョブが存在しない場合、404エラーを返す', async () => {
    const jobId = 'non-existent-job-id';

    // DynamoDB GetCommand のモック（ジョブなし）
    dynamoMock.on(GetCommand).resolves({});

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({
      error: 'JOB_NOT_FOUND',
      message: '指定されたジョブが見つかりません',
    });

    // S3、Batchへのリクエストが行われていないことを確認
    expect(s3Mock.calls()).toHaveLength(0);
    expect(batchMock.calls()).toHaveLength(0);
    expect(dynamoMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('異常系: ジョブステータスがPROCESSINGの場合、409エラーを返す', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

    // DynamoDB GetCommand のモック（PROCESSING状態のジョブ）
    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'PROCESSING',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputCodec: 'h264',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067200,
        expiresAt: 1704153600,
      },
    });

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({
      error: 'INVALID_STATUS',
      message: 'ジョブは既に実行中または完了しています',
    });

    expect(s3Mock.calls()).toHaveLength(0);
    expect(batchMock.calls()).toHaveLength(0);
    expect(dynamoMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('異常系: ジョブステータスがCOMPLETEDの場合、409エラーを返す', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

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

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('INVALID_STATUS');
    expect(s3Mock.calls()).toHaveLength(0);
    expect(batchMock.calls()).toHaveLength(0);
  });

  it('異常系: ジョブステータスがFAILEDの場合、409エラーを返す', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'FAILED',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputCodec: 'h264',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067800,
        expiresAt: 1704153600,
        errorMessage: 'FFmpeg failed',
      },
    });

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('INVALID_STATUS');
    expect(s3Mock.calls()).toHaveLength(0);
    expect(batchMock.calls()).toHaveLength(0);
  });

  it('異常系: S3に入力ファイルが存在しない場合、404エラーを返す', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

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

    // S3 HeadObjectCommand のモック（ファイルなし）
    s3Mock.on(HeadObjectCommand).rejects(new Error('NoSuchKey'));

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({
      error: 'FILE_NOT_FOUND',
      message: '入力ファイルが見つかりません',
    });

    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(1);
    expect(batchMock.calls()).toHaveLength(0);
    expect(dynamoMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('異常系: DynamoDB更新エラー時、500エラーを返す', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

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

    s3Mock.on(HeadObjectCommand).resolves({});
    batchMock.on(SubmitJobCommand).resolves({
      jobId: 'batch-job-id',
    });

    // DynamoDB UpdateCommand のモック（エラー）
    dynamoMock.on(UpdateCommand).rejects(new Error('DynamoDB Error'));

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの投入に失敗しました',
    });
  });

  it('異常系: Batchジョブ投入エラー時、500エラーを返す', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

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

    s3Mock.on(HeadObjectCommand).resolves({});

    // Batch SubmitJobCommand のモック（エラー）
    batchMock.on(SubmitJobCommand).rejects(new Error('Batch Error'));

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'ジョブの投入に失敗しました',
    });

    expect(dynamoMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('正常系: vp9コーデックでBatchジョブを投入できる', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'PENDING',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputCodec: 'vp9',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067200,
        expiresAt: 1704153600,
      },
    });

    s3Mock.on(HeadObjectCommand).resolves({});
    batchMock.on(SubmitJobCommand).resolves({ jobId: 'batch-job-id' });
    dynamoMock.on(UpdateCommand).resolves({});

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('PROCESSING');

    const submitCall = batchMock.call(0);
    const environment = submitCall.args[0].input.containerOverrides?.environment;
    expect(environment).toContainEqual({
      name: 'OUTPUT_CODEC',
      value: 'vp9',
    });
  });

  it('正常系: av1コーデックでBatchジョブを投入できる', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

    dynamoMock.on(GetCommand).resolves({
      Item: {
        jobId,
        status: 'PENDING',
        inputFile: `uploads/${jobId}/input.mp4`,
        outputCodec: 'av1',
        fileName: 'test-video.mp4',
        fileSize: 100 * 1024 * 1024,
        createdAt: 1704067200,
        updatedAt: 1704067200,
        expiresAt: 1704153600,
      },
    });

    s3Mock.on(HeadObjectCommand).resolves({});
    batchMock.on(SubmitJobCommand).resolves({ jobId: 'batch-job-id' });
    dynamoMock.on(UpdateCommand).resolves({});

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('PROCESSING');

    const submitCall = batchMock.call(0);
    const environment = submitCall.args[0].input.containerOverrides?.environment;
    expect(environment).toContainEqual({
      name: 'OUTPUT_CODEC',
      value: 'av1',
    });
  });

  it('正常系: 環境変数がデフォルト値で動作する', async () => {
    const jobId = '550e8400-e29b-41d4-a716-446655440000';

    // 環境変数を一時的に削除
    const originalRegion = process.env.AWS_REGION;
    const originalTable = process.env.DYNAMODB_TABLE;
    const originalBucket = process.env.S3_BUCKET;
    const originalQueue = process.env.BATCH_JOB_QUEUE;
    const originalDefinition = process.env.BATCH_JOB_DEFINITION;

    delete process.env.AWS_REGION;
    delete process.env.DYNAMODB_TABLE;
    delete process.env.S3_BUCKET;
    delete process.env.BATCH_JOB_QUEUE;
    delete process.env.BATCH_JOB_DEFINITION;

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

    s3Mock.on(HeadObjectCommand).resolves({});
    batchMock.on(SubmitJobCommand).resolves({ jobId: 'batch-job-id' });
    dynamoMock.on(UpdateCommand).resolves({});

    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/submit`, {
      method: 'POST',
    });
    const params = Promise.resolve({ jobId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('PROCESSING');

    // 環境変数を復元
    process.env.AWS_REGION = originalRegion;
    process.env.DYNAMODB_TABLE = originalTable;
    process.env.S3_BUCKET = originalBucket;
    process.env.BATCH_JOB_QUEUE = originalQueue;
    process.env.BATCH_JOB_DEFINITION = originalDefinition;
  });
});
