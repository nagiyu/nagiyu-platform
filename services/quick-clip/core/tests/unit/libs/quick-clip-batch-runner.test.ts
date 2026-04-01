const mockS3Send = jest.fn();
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();
const mockUpdateStatus = jest.fn();
const mockCreateMany = jest.fn();
const mockAggregate = jest.fn();
const TEST_ERRORS = {
  NO_SUCH_KEY: { name: 'NoSuchKey', Code: 'NoSuchKey' } as const,
};
const DOWNLOAD_RETRY_COUNT = 600;
const DOWNLOAD_RETRY_INTERVAL_MS = 3000;

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({})),
  },
}));

jest.mock('node:fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

jest.mock('node:fs', () => ({
  createReadStream: jest.fn(),
}));

jest.mock('../../../src/repositories/dynamodb-job.repository.js', () => ({
  DynamoDBJobRepository: jest.fn().mockImplementation(() => ({
    getById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
  })),
}));

jest.mock('../../../src/repositories/dynamodb-highlight.repository.js', () => ({
  DynamoDBHighlightRepository: jest.fn().mockImplementation(() => ({
    createMany: mockCreateMany,
  })),
}));

jest.mock('../../../src/libs/job.service.js', () => ({
  JobService: jest.fn().mockImplementation(() => ({
    updateStatus: mockUpdateStatus,
  })),
}));

jest.mock('../../../src/libs/highlight-aggregation.service.js', () => ({
  HighlightAggregationService: jest.fn().mockImplementation(() => ({
    aggregate: mockAggregate,
  })),
}));

jest.mock('../../../src/libs/motion-highlight.service.js', () => ({
  MotionHighlightService: jest.fn(),
}));

jest.mock('../../../src/libs/volume-highlight.service.js', () => ({
  VolumeHighlightService: jest.fn(),
}));

jest.mock('../../../src/libs/ffmpeg-video-analyzer.js', () => ({
  FfmpegVideoAnalyzer: jest.fn(),
}));

import {
  runQuickClipBatch,
  type QuickClipBatchRunInput,
} from '../../../src/libs/quick-clip-batch-runner.js';

const input: QuickClipBatchRunInput = {
  command: 'extract',
  jobId: 'job-1',
  tableName: 'table',
  bucketName: 'bucket',
  awsRegion: 'ap-northeast-1',
};

describe('runQuickClipBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockCreateMany.mockResolvedValue(undefined);
    mockAggregate.mockResolvedValue([]);
    mockUpdateStatus.mockResolvedValue(undefined);
  });

  it('NoSuchKey が一時的に発生してもリトライで取得できれば処理を継続する', async () => {
    jest.useFakeTimers();
    mockS3Send.mockRejectedValueOnce(TEST_ERRORS.NO_SUCH_KEY).mockResolvedValueOnce({
      Body: {
        transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      },
    });

    const runPromise = runQuickClipBatch(input);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(runPromise).resolves.toBeUndefined();

    expect(mockS3Send).toHaveBeenCalledTimes(2);
    expect(mockUpdateStatus).toHaveBeenCalledWith('job-1', 'PROCESSING', undefined);
    expect(mockUpdateStatus).toHaveBeenCalledWith('job-1', 'COMPLETED', undefined);
    expect(mockUpdateStatus).not.toHaveBeenCalledWith('job-1', 'FAILED', expect.anything());
  });

  it('NoSuchKey が解消しない場合は FAILED として動画未検出メッセージを記録する', async () => {
    jest.useFakeTimers();
    mockS3Send.mockRejectedValue(TEST_ERRORS.NO_SUCH_KEY);

    const assertion = expect(runQuickClipBatch(input)).rejects.toThrow(
      'アップロード済みの動画ファイルが見つかりません: uploads/job-1/input.mp4'
    );
    await jest.advanceTimersByTimeAsync((DOWNLOAD_RETRY_COUNT - 1) * DOWNLOAD_RETRY_INTERVAL_MS);
    await assertion;

    expect(mockS3Send).toHaveBeenCalledTimes(DOWNLOAD_RETRY_COUNT);
    expect(mockUpdateStatus).toHaveBeenCalledWith('job-1', 'PROCESSING', undefined);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'job-1',
      'FAILED',
      'アップロード済みの動画ファイルが見つかりません: uploads/job-1/input.mp4'
    );
  });

  it('extract コマンドで生成する見どころは clipStatus を PENDING で保存する', async () => {
    mockS3Send.mockResolvedValue({
      Body: {
        transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      },
    });
    mockAggregate.mockResolvedValue([
      { startSec: 5, endSec: 8, source: 'volume' },
      { startSec: 1, endSec: 3, source: 'motion' },
    ]);

    await expect(runQuickClipBatch(input)).resolves.toBeUndefined();

    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    expect(mockCreateMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: 'job-1',
          startSec: 1,
          endSec: 3,
          order: 1,
          source: 'motion',
          status: 'pending',
          clipStatus: 'PENDING',
        }),
        expect.objectContaining({
          jobId: 'job-1',
          startSec: 5,
          endSec: 8,
          order: 2,
          source: 'volume',
          status: 'pending',
          clipStatus: 'PENDING',
        }),
      ])
    );
  });
});
