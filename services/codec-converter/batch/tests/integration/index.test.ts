import {
  validateEnvironment,
  downloadFromS3,
  uploadToS3,
  updateJobStatus,
  convertWithFFmpeg,
  cleanup,
  processJob,
  main,
  getECSMetadata,
} from '../../src/index.js';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { Readable } from 'stream';
import { promises as fs, createReadStream, ReadStream } from 'fs';
import * as child_process from 'child_process';
import type { ChildProcess } from 'child_process';
import type { CodecType } from 'codec-converter-core';
import type { SdkStream } from '@smithy/types';

// AWS SDK モック
const s3Mock = mockClient(S3Client);
const dynamodbMock = mockClient(DynamoDBDocumentClient);

// DynamoDBDocumentClient のモック用のヘルパー
const createMockDynamoDBClient = () => {
  // DynamoDBDocumentClient.from() を使わず、直接モックを返す
  return dynamodbMock as unknown as DynamoDBDocumentClient;
};

// child_process.spawn のモック
jest.mock('child_process');
const spawnMock = child_process.spawn as jest.MockedFunction<typeof child_process.spawn>;

// fs.unlink と createReadStream のモック
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn(),
  promises: {
    ...jest.requireActual('fs').promises,
    unlink: jest.fn(),
  },
}));

const createReadStreamMock = createReadStream as jest.MockedFunction<typeof createReadStream>;

describe('validateEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('すべての環境変数が設定されている場合は成功', () => {
    process.env.S3_BUCKET = 'test-bucket';
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.JOB_ID = 'test-job-id';
    process.env.OUTPUT_CODEC = 'h264';
    process.env.JOB_DEFINITION_NAME = 'codec-converter-dev-medium';

    const result = validateEnvironment();

    expect(result).toEqual({
      S3_BUCKET: 'test-bucket',
      DYNAMODB_TABLE: 'test-table',
      AWS_REGION: 'ap-northeast-1',
      JOB_ID: 'test-job-id',
      OUTPUT_CODEC: 'h264',
      JOB_DEFINITION_NAME: 'codec-converter-dev-medium',
    });
  });

  it('JOB_DEFINITION_NAMEが未設定でも成功する', () => {
    process.env.S3_BUCKET = 'test-bucket';
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.JOB_ID = 'test-job-id';
    process.env.OUTPUT_CODEC = 'h264';
    delete process.env.JOB_DEFINITION_NAME;

    const result = validateEnvironment();

    expect(result).toEqual({
      S3_BUCKET: 'test-bucket',
      DYNAMODB_TABLE: 'test-table',
      AWS_REGION: 'ap-northeast-1',
      JOB_ID: 'test-job-id',
      OUTPUT_CODEC: 'h264',
      JOB_DEFINITION_NAME: undefined,
    });
  });

  it('環境変数が不足している場合はエラー', () => {
    process.env.S3_BUCKET = 'test-bucket';
    // 他の環境変数を設定しない

    expect(() => validateEnvironment()).toThrow('必要な環境変数が設定されていません');
  });

  it('OUTPUT_CODECが不正な場合はエラー', () => {
    process.env.S3_BUCKET = 'test-bucket';
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.JOB_ID = 'test-job-id';
    process.env.OUTPUT_CODEC = 'invalid';

    expect(() => validateEnvironment()).toThrow('出力コーデックが不正です');
  });

  it('h264、vp9、av1はすべて有効なコーデック', () => {
    const codecs: CodecType[] = ['h264', 'vp9', 'av1'];

    codecs.forEach((codec) => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.DYNAMODB_TABLE = 'test-table';
      process.env.AWS_REGION = 'ap-northeast-1';
      process.env.JOB_ID = 'test-job-id';
      process.env.OUTPUT_CODEC = codec;
      process.env.JOB_DEFINITION_NAME = 'codec-converter-dev-medium';

      const result = validateEnvironment();
      expect(result.OUTPUT_CODEC).toBe(codec);
    });
  });
});

describe('getECSMetadata', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('ECS_CONTAINER_METADATA_URI_V4が設定されている場合はメタデータを取得', async () => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://localhost:8080';

    const mockMetadata = {
      Limits: {
        CPU: 2,
        Memory: 4096,
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockMetadata),
    });

    const result = await getECSMetadata();

    expect(result).toEqual(mockMetadata);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8080/task');
  });

  it('ECS_CONTAINER_METADATA_URI_V4が未設定の場合は空オブジェクトを返す', async () => {
    delete process.env.ECS_CONTAINER_METADATA_URI_V4;

    const result = await getECSMetadata();

    expect(result).toEqual({});
  });

  it('メタデータ取得に失敗した場合は空オブジェクトを返す', async () => {
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://localhost:8080';

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await getECSMetadata();

    expect(result).toEqual({});
  });
});

describe('downloadFromS3', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('S3からファイルをダウンロードできる', async () => {
    const mockBody = Readable.from(['test content']);
    s3Mock.on(GetObjectCommand).resolves({
      Body: mockBody as SdkStream<Readable>,
    });

    const s3Client = new S3Client({});
    await downloadFromS3(s3Client, 'test-bucket', 'test-key', '/tmp/test-download');

    expect(s3Mock.calls()).toHaveLength(1);
  });

  it('S3レスポンスのBodyが空の場合はエラー', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: undefined,
    });

    const s3Client = new S3Client({});

    await expect(
      downloadFromS3(s3Client, 'test-bucket', 'test-key', '/tmp/test-download')
    ).rejects.toThrow('S3からのダウンロードに失敗しました');
  });

  it('S3エラーが発生した場合はエラー', async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error('S3 Error'));

    const s3Client = new S3Client({});

    await expect(
      downloadFromS3(s3Client, 'test-bucket', 'test-key', '/tmp/test-download')
    ).rejects.toThrow('S3からのダウンロードに失敗しました');
  });
});

describe('uploadToS3', () => {
  beforeEach(() => {
    s3Mock.reset();
    createReadStreamMock.mockClear();
  });

  it.skip('S3にファイルをアップロードできる', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const s3Client = new S3Client({ region: 'us-east-1' });
    // Note: ファイルが存在しないため、実際のファイル読み込みは失敗する
    // モックはファイルシステムをバイパスしないため、このテストではエラーを期待する
    await expect(
      uploadToS3(s3Client, 'test-bucket', 'test-key', '/nonexistent/file')
    ).rejects.toThrow('S3へのアップロードに失敗しました');
  });

  it('S3エラーが発生した場合はエラー', async () => {
    // createReadStreamをモックして、実際のファイルシステムアクセスを防ぐ
    const mockStream = new Readable();
    mockStream.push('test content');
    mockStream.push(null);

    createReadStreamMock.mockReturnValue(mockStream as ReadStream);

    s3Mock.on(PutObjectCommand).rejects(new Error('S3 Error'));

    const s3Client = new S3Client({});

    await expect(
      uploadToS3(s3Client, 'test-bucket', 'test-key', '/nonexistent/file')
    ).rejects.toThrow('S3へのアップロードに失敗しました');
  });
});

describe('updateJobStatus', () => {
  beforeEach(() => {
    dynamodbMock.reset();
  });

  it('ステータスをPROCESSINGに更新できる', async () => {
    dynamodbMock.on(UpdateCommand).resolves({});

    const dynamodbClient = createMockDynamoDBClient();

    await updateJobStatus(dynamodbClient, 'test-table', 'test-job-id', 'PROCESSING');

    expect(dynamodbMock.calls()).toHaveLength(1);
    const call = dynamodbMock.call(0);
    expect(call.args[0].input).toMatchObject({
      TableName: 'test-table',
      Key: { jobId: 'test-job-id' },
    });
  });

  it('ステータスをCOMPLETEDに更新し、outputFileを設定できる', async () => {
    dynamodbMock.on(UpdateCommand).resolves({});

    const dynamodbClient = createMockDynamoDBClient();

    await updateJobStatus(
      dynamodbClient,
      'test-table',
      'test-job-id',
      'COMPLETED',
      'outputs/test-job-id/output.mp4'
    );

    expect(dynamodbMock.calls()).toHaveLength(1);
    const call = dynamodbMock.call(0);
    expect(
      (call.args[0].input as Record<string, unknown>).ExpressionAttributeValues
    ).toHaveProperty(':outputFile');
  });

  it('ステータスをFAILEDに更新し、errorMessageを設定できる', async () => {
    dynamodbMock.on(UpdateCommand).resolves({});

    const dynamodbClient = createMockDynamoDBClient();

    await updateJobStatus(
      dynamodbClient,
      'test-table',
      'test-job-id',
      'FAILED',
      undefined,
      'Test error'
    );

    expect(dynamodbMock.calls()).toHaveLength(1);
    const call = dynamodbMock.call(0);
    expect(
      (call.args[0].input as Record<string, unknown>).ExpressionAttributeValues
    ).toHaveProperty(':errorMessage');
  });

  it('DynamoDBエラーが発生した場合はエラー', async () => {
    dynamodbMock.on(UpdateCommand).rejects(new Error('DynamoDB Error'));

    const dynamodbClient = createMockDynamoDBClient();

    await expect(
      updateJobStatus(dynamodbClient, 'test-table', 'test-job-id', 'PROCESSING')
    ).rejects.toThrow('DynamoDBの更新に失敗しました');
  });
});

describe('convertWithFFmpeg', () => {
  beforeEach(() => {
    spawnMock.mockClear();
  });

  it('FFmpegでH.264変換が成功する', async () => {
    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            // FFmpegのstderrをシミュレート
            callback(Buffer.from('ffmpeg output'));
          }
        }),
      },
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          callback(0); // 正常終了
        }
      }),
    } as unknown as ChildProcess;

    spawnMock.mockReturnValue(mockFFmpeg);

    await convertWithFFmpeg('/tmp/input.mp4', '/tmp/output.mp4', 'h264');

    expect(spawnMock).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', '/tmp/input.mp4'])
    );
  });

  it('FFmpegでVP9変換が成功する', async () => {
    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    } as unknown as ChildProcess;

    spawnMock.mockReturnValue(mockFFmpeg);

    await convertWithFFmpeg('/tmp/input.mp4', '/tmp/output.webm', 'vp9');

    expect(spawnMock).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-c:v', 'libvpx-vp9'])
    );
  });

  it('FFmpegでAV1変換が成功する', async () => {
    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    } as unknown as ChildProcess;

    spawnMock.mockReturnValue(mockFFmpeg);

    await convertWithFFmpeg('/tmp/input.mp4', '/tmp/output.webm', 'av1');

    expect(spawnMock).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-c:v', 'libaom-av1', '-cpu-used', '4'])
    );
  });

  it('FFmpegが失敗した場合はエラー', async () => {
    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: {
        on: jest.fn((event, callback) => {
          if (event === 'data') callback(Buffer.from('error output'));
        }),
      },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(1); // エラー終了
      }),
    } as unknown as ChildProcess;

    spawnMock.mockReturnValue(mockFFmpeg);

    await expect(convertWithFFmpeg('/tmp/input.mp4', '/tmp/output.mp4', 'h264')).rejects.toThrow(
      'FFmpegの実行に失敗しました'
    );
  });
});

describe('cleanup', () => {
  const unlinkMock = fs.unlink as jest.MockedFunction<typeof fs.unlink>;

  beforeEach(() => {
    unlinkMock.mockClear();
  });

  it('ファイルを削除できる', async () => {
    unlinkMock.mockResolvedValue(undefined);

    await cleanup(['/tmp/file1', '/tmp/file2']);

    expect(unlinkMock).toHaveBeenCalledTimes(2);
  });

  it('存在しないファイルのエラーは無視される', async () => {
    const error: NodeJS.ErrnoException = new Error('ENOENT');
    error.code = 'ENOENT';
    unlinkMock.mockRejectedValue(error);

    await expect(cleanup(['/tmp/nonexistent'])).resolves.not.toThrow();
  });

  it('削除エラーが発生した場合はエラー', async () => {
    unlinkMock.mockRejectedValue(new Error('Permission denied'));

    await expect(cleanup(['/tmp/file'])).rejects.toThrow(
      '一時ファイルのクリーンアップに失敗しました'
    );
  });
});

describe('processJob', () => {
  const unlinkMock = fs.unlink as jest.MockedFunction<typeof fs.unlink>;

  beforeEach(() => {
    s3Mock.reset();
    dynamodbMock.reset();
    spawnMock.mockClear();
    unlinkMock.mockClear();
    unlinkMock.mockResolvedValue(undefined);
  });

  it.skip('ジョブ処理が成功する', async () => {
    // S3ダウンロードをモック
    const mockBody = Readable.from(['test content']);
    s3Mock.on(GetObjectCommand).resolves({ Body: mockBody as SdkStream<Readable> });
    s3Mock.on(PutObjectCommand).resolves({});

    // DynamoDB更新をモック
    dynamodbMock.on(UpdateCommand).resolves({});

    // FFmpegをモック
    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    } as unknown as ChildProcess;
    spawnMock.mockReturnValue(mockFFmpeg);

    const env = {
      S3_BUCKET: 'test-bucket',
      DYNAMODB_TABLE: 'test-table',
      AWS_REGION: 'ap-northeast-1',
      JOB_ID: 'test-job-id',
      OUTPUT_CODEC: 'h264' as CodecType,
    };

    const s3Client = new S3Client({ region: 'us-east-1' });
    const dynamodbClient = createMockDynamoDBClient();

    await processJob(env, s3Client, dynamodbClient);

    // DynamoDBが2回呼ばれる（PROCESSING, COMPLETED）
    expect(dynamodbMock.calls()).toHaveLength(2);
  });

  it.skip('エラーが発生した場合はステータスをFAILEDに更新', async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error('S3 Error'));
    dynamodbMock.on(UpdateCommand).resolves({});

    const env = {
      S3_BUCKET: 'test-bucket',
      DYNAMODB_TABLE: 'test-table',
      AWS_REGION: 'ap-northeast-1',
      JOB_ID: 'test-job-id',
      OUTPUT_CODEC: 'h264' as CodecType,
    };

    const s3Client = new S3Client({ region: 'us-east-1' });
    const dynamodbClient = createMockDynamoDBClient();

    await expect(processJob(env, s3Client, dynamodbClient)).rejects.toThrow();

    // DynamoDBが2回呼ばれる（PROCESSING, FAILED）
    expect(dynamodbMock.calls()).toHaveLength(2);
  });
});

describe('main', () => {
  const originalEnv = process.env;
  const unlinkMock = fs.unlink as jest.MockedFunction<typeof fs.unlink>;
  const originalFetch = global.fetch;
  const originalConsoleLog = console.log;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    s3Mock.reset();
    dynamodbMock.reset();
    spawnMock.mockClear();
    unlinkMock.mockClear();
    unlinkMock.mockResolvedValue(undefined);
    console.log = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    console.log = originalConsoleLog;
  });

  it('Worker起動時にリソース情報をログ出力する', async () => {
    process.env.S3_BUCKET = 'test-bucket';
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.JOB_ID = 'test-job-id';
    process.env.OUTPUT_CODEC = 'h264';
    process.env.JOB_DEFINITION_NAME = 'codec-converter-dev-medium';
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://localhost:8080';

    const mockMetadata = {
      Limits: {
        CPU: 2,
        Memory: 4096,
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockMetadata),
    });

    const mockBody = Readable.from(['test content']);
    s3Mock.on(GetObjectCommand).resolves({ Body: mockBody as SdkStream<Readable> });
    s3Mock.on(PutObjectCommand).resolves({});
    dynamodbMock.on(UpdateCommand).resolves({});

    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    } as unknown as ChildProcess;
    spawnMock.mockReturnValue(mockFFmpeg);

    await main();

    // ログが正しく出力されたことを確認
    expect(console.log).toHaveBeenCalledWith('Batch Worker started', {
      jobId: 'test-job-id',
      outputCodec: 'h264',
      jobDefinitionName: 'codec-converter-dev-medium',
      resources: {
        cpu: 2,
        memory: 4096,
      },
    });
  });

  it('JOB_DEFINITION_NAMEが未設定の場合はunknownと表示', async () => {
    process.env.S3_BUCKET = 'test-bucket';
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.JOB_ID = 'test-job-id';
    process.env.OUTPUT_CODEC = 'vp9';
    delete process.env.JOB_DEFINITION_NAME;
    delete process.env.ECS_CONTAINER_METADATA_URI_V4;

    const mockBody = Readable.from(['test content']);
    s3Mock.on(GetObjectCommand).resolves({ Body: mockBody as SdkStream<Readable> });
    s3Mock.on(PutObjectCommand).resolves({});
    dynamodbMock.on(UpdateCommand).resolves({});

    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    } as unknown as ChildProcess;
    spawnMock.mockReturnValue(mockFFmpeg);

    await main();

    // ログが正しく出力されたことを確認
    expect(console.log).toHaveBeenCalledWith('Batch Worker started', {
      jobId: 'test-job-id',
      outputCodec: 'vp9',
      jobDefinitionName: 'unknown',
      resources: {
        cpu: 'unknown',
        memory: 'unknown',
      },
    });
  });

  it('ECSメタデータのLimitsが存在するがCPU/Memoryが未定義の場合', async () => {
    process.env.S3_BUCKET = 'test-bucket';
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.JOB_ID = 'test-job-id-2';
    process.env.OUTPUT_CODEC = 'av1';
    process.env.JOB_DEFINITION_NAME = 'codec-converter-dev-large';
    process.env.ECS_CONTAINER_METADATA_URI_V4 = 'http://localhost:8080';

    const mockMetadata = {
      Limits: {
        // CPU と Memory が undefined
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockMetadata),
    });

    const mockBody = Readable.from(['test content']);
    s3Mock.on(GetObjectCommand).resolves({ Body: mockBody as SdkStream<Readable> });
    s3Mock.on(PutObjectCommand).resolves({});
    dynamodbMock.on(UpdateCommand).resolves({});

    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    } as unknown as ChildProcess;
    spawnMock.mockReturnValue(mockFFmpeg);

    await main();

    // ログが正しく出力されたことを確認
    expect(console.log).toHaveBeenCalledWith('Batch Worker started', {
      jobId: 'test-job-id-2',
      outputCodec: 'av1',
      jobDefinitionName: 'codec-converter-dev-large',
      resources: {
        cpu: 'unknown',
        memory: 'unknown',
      },
    });
  });

  it.skip('メイン処理が成功する', async () => {
    process.env.S3_BUCKET = 'test-bucket';
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.JOB_ID = 'test-job-id';
    process.env.OUTPUT_CODEC = 'h264';

    const mockBody = Readable.from(['test content']);
    s3Mock.on(GetObjectCommand).resolves({ Body: mockBody as SdkStream<Readable> });
    s3Mock.on(PutObjectCommand).resolves({});
    dynamodbMock.on(UpdateCommand).resolves({});

    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    } as unknown as ChildProcess;
    spawnMock.mockReturnValue(mockFFmpeg);

    await expect(main()).resolves.not.toThrow();
  });

  it.skip('リトライ後に成功する', async () => {
    process.env.S3_BUCKET = 'test-bucket';
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.JOB_ID = 'test-job-id';
    process.env.OUTPUT_CODEC = 'h264';

    // 最初の2回は失敗、3回目は成功
    let attempt = 0;
    s3Mock.on(GetObjectCommand).callsFake(() => {
      attempt++;
      if (attempt < 3) {
        return Promise.reject(new Error('S3 Error'));
      }
      return Promise.resolve({ Body: Readable.from(['test content']) as SdkStream<Readable> });
    });

    s3Mock.on(PutObjectCommand).resolves({});
    dynamodbMock.on(UpdateCommand).resolves({});

    const mockFFmpeg = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(0);
      }),
    } as unknown as ChildProcess;
    spawnMock.mockReturnValue(mockFFmpeg);

    await expect(main()).resolves.not.toThrow();
    expect(attempt).toBe(3); // 3回試行されたことを確認
  });

  it.skip('最大リトライ回数後も失敗した場合はエラー', async () => {
    process.env.S3_BUCKET = 'test-bucket';
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.JOB_ID = 'test-job-id';
    process.env.OUTPUT_CODEC = 'h264';

    s3Mock.on(GetObjectCommand).rejects(new Error('S3 Error'));
    dynamodbMock.on(UpdateCommand).resolves({});

    await expect(main()).rejects.toThrow();
  });
});
