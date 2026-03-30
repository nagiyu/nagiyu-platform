const mockS3Send = jest.fn();
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();
const mockReadFile = jest.fn();
const mockUpdateStatus = jest.fn();
const mockCreateMany = jest.fn();
const mockAggregate = jest.fn();
const mockSplitClips = jest.fn();
const mockGetByJobId = jest.fn();
const mockGetJob = jest.fn();
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
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
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
  readFile: mockReadFile,
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
    getByJobId: mockGetByJobId,
  })),
}));

jest.mock('../../../src/libs/job.service.js', () => ({
  JobService: jest.fn().mockImplementation(() => ({
    updateStatus: mockUpdateStatus,
    getJob: mockGetJob,
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

jest.mock('../../../src/libs/ffmpeg-clip-splitter.js', () => ({
  FfmpegClipSplitter: jest.fn().mockImplementation(() => ({
    splitClips: mockSplitClips,
  })),
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
    mockReadFile.mockResolvedValue(Buffer.from([1, 2, 3]));
    mockSplitClips.mockResolvedValue([]);
    mockGetByJobId.mockResolvedValue([]);
    mockGetJob.mockResolvedValue(null);
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

  it('split コマンドでは実際の ZIP バイナリを生成してアップロードする', async () => {
    const acceptedHighlights = [
      {
        jobId: 'job-1',
        highlightId: 'highlight-1',
        order: 1,
        startSec: 0,
        endSec: 5,
        status: 'accepted',
      },
    ] as const;
    mockGetByJobId.mockResolvedValue(acceptedHighlights);
    mockSplitClips.mockResolvedValue(['/tmp/job-1-highlight-1.mp4']);
    mockReadFile.mockResolvedValue(Buffer.from([0x11, 0x22, 0x33]));
    mockGetJob.mockResolvedValue({
      jobId: 'job-1',
      status: 'COMPLETED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockS3Send.mockResolvedValue({
      Body: {
        transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      },
    });

    await expect(runQuickClipBatch({ ...input, command: 'split' })).resolves.toBeUndefined();

    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    const zipWriteCall = mockWriteFile.mock.calls.find(
      ([outputPath]) => typeof outputPath === 'string' && outputPath.endsWith('/clips.zip')
    );
    expect(zipWriteCall).toBeDefined();
    const zipBuffer = zipWriteCall?.[1];
    expect(Buffer.isBuffer(zipBuffer)).toBe(true);
    expect((zipBuffer as Buffer).subarray(0, 4).toString('hex')).toBe('504b0304');
  });
});
