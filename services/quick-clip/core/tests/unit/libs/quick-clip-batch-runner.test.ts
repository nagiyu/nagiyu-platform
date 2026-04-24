const mockS3Send = jest.fn();
const mockMkdir = jest.fn();
const mockStat = jest.fn();
const mockCreateWriteStream = jest.fn();
const mockPipeline = jest.fn();
const mockUpdateBatchStage = jest.fn();
const mockUpdateErrorMessage = jest.fn();
const mockGetJob = jest.fn();
const mockCreateMany = jest.fn();
const mockAggregate = jest.fn();
const mockGetDurationSec = jest.fn();
const mockAnalyzeMotion = jest.fn();
const mockAnalyzeVolume = jest.fn();
const mockTranscribe = jest.fn();
const mockGetScores = jest.fn();
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
  stat: mockStat,
}));

jest.mock('node:fs', () => ({
  createWriteStream: mockCreateWriteStream,
}));

jest.mock('node:stream/promises', () => ({
  pipeline: mockPipeline,
}));

jest.mock('../../../src/repositories/dynamodb-job.repository.js', () => ({
  DynamoDBJobRepository: jest.fn().mockImplementation(() => ({
    getById: jest.fn(),
    create: jest.fn(),
    updateBatchJobId: jest.fn(),
    updateBatchStage: jest.fn(),
    updateErrorMessage: jest.fn(),
  })),
}));

jest.mock('../../../src/repositories/dynamodb-highlight.repository.js', () => ({
  DynamoDBHighlightRepository: jest.fn().mockImplementation(() => ({
    createMany: mockCreateMany,
  })),
}));

jest.mock('../../../src/libs/job.service.js', () => ({
  JobService: jest.fn().mockImplementation(() => ({
    updateBatchStage: mockUpdateBatchStage,
    updateErrorMessage: mockUpdateErrorMessage,
    getJob: mockGetJob,
  })),
}));

jest.mock('../../../src/libs/highlight-aggregation.service.js', () => ({
  HighlightAggregationService: jest.fn().mockImplementation(() => ({
    aggregate: mockAggregate,
  })),
}));

jest.mock('../../../src/libs/motion-highlight.service.js', () => ({
  MotionHighlightService: jest.fn().mockImplementation(() => ({
    analyzeMotion: mockAnalyzeMotion,
  })),
}));

jest.mock('../../../src/libs/volume-highlight.service.js', () => ({
  VolumeHighlightService: jest.fn().mockImplementation(() => ({
    analyzeVolume: mockAnalyzeVolume,
  })),
}));

jest.mock('../../../src/libs/ffmpeg-video-analyzer.js', () => ({
  FfmpegVideoAnalyzer: jest.fn().mockImplementation(() => ({
    getDurationSec: mockGetDurationSec,
  })),
}));

jest.mock('../../../src/libs/openai-client.js', () => ({
  createOpenAIClient: jest.fn().mockReturnValue({}),
}));

jest.mock('../../../src/libs/transcription.service.js', () => ({
  TranscriptionService: jest.fn().mockImplementation(() => ({
    transcribe: mockTranscribe,
  })),
}));

jest.mock('../../../src/libs/emotion-highlight.service.js', () => ({
  EmotionHighlightService: jest.fn().mockImplementation(() => ({
    getScores: mockGetScores,
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

const JOB_EXPIRES_AT = 1234567890;

describe('runQuickClipBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();

    mockMkdir.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ size: 10 * 1024 * 1024 });
    mockCreateWriteStream.mockReturnValue({} as NodeJS.WritableStream);
    mockPipeline.mockResolvedValue(undefined);
    mockCreateMany.mockResolvedValue(undefined);
    mockAggregate.mockReturnValue([]);
    mockGetDurationSec.mockResolvedValue(120);
    mockAnalyzeMotion.mockResolvedValue([]);
    mockAnalyzeVolume.mockResolvedValue([]);
    mockUpdateBatchStage.mockResolvedValue(undefined);
    mockUpdateErrorMessage.mockResolvedValue(undefined);
    mockGetJob.mockResolvedValue({ expiresAt: JOB_EXPIRES_AT });
    mockTranscribe.mockResolvedValue([]);
    mockGetScores.mockResolvedValue([]);
  });

  it('NoSuchKey が一時的に発生してもリトライで取得できれば処理を継続する', async () => {
    jest.useFakeTimers();
    mockS3Send.mockRejectedValueOnce(TEST_ERRORS.NO_SUCH_KEY).mockResolvedValueOnce({
      Body: {
        pipe: jest.fn(),
      },
    });

    const runPromise = runQuickClipBatch(input);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(runPromise).resolves.toBeUndefined();

    expect(mockS3Send).toHaveBeenCalledTimes(2);
    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'downloading');
    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'analyzing');
    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'aggregating');
    expect(mockUpdateErrorMessage).not.toHaveBeenCalled();
    expect(mockGetDurationSec).toHaveBeenCalledWith('/tmp/quick-clip/job-1/input.mp4');
    expect(mockAggregate).toHaveBeenCalledWith([], [], 120);
  });

  it('NoSuchKey が解消しない場合は errorMessage を記録する', async () => {
    jest.useFakeTimers();
    mockS3Send.mockRejectedValue(TEST_ERRORS.NO_SUCH_KEY);

    const assertion = expect(runQuickClipBatch(input)).rejects.toThrow(
      'アップロード済みの動画ファイルが見つかりません: uploads/job-1/input.mp4'
    );
    await jest.advanceTimersByTimeAsync((DOWNLOAD_RETRY_COUNT - 1) * DOWNLOAD_RETRY_INTERVAL_MS);
    await assertion;

    expect(mockS3Send).toHaveBeenCalledTimes(DOWNLOAD_RETRY_COUNT);
    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'downloading');
    expect(mockUpdateErrorMessage).toHaveBeenCalledWith(
      'job-1',
      'アップロード済みの動画ファイルが見つかりません: uploads/job-1/input.mp4'
    );
  });

  it('extract コマンドで生成する見どころは clipStatus を PENDING で保存する', async () => {
    mockS3Send.mockResolvedValue({
      Body: {
        pipe: jest.fn(),
      },
    });
    mockAnalyzeMotion.mockResolvedValue([{ second: 1, score: 100 }]);
    mockAnalyzeVolume.mockResolvedValue([{ second: 5, score: 90 }]);
    mockAggregate.mockReturnValue([
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
          status: 'unconfirmed',
          clipStatus: 'PENDING',
          expiresAt: JOB_EXPIRES_AT,
        }),
        expect.objectContaining({
          jobId: 'job-1',
          startSec: 5,
          endSec: 8,
          order: 2,
          source: 'volume',
          status: 'unconfirmed',
          clipStatus: 'PENDING',
          expiresAt: JOB_EXPIRES_AT,
        }),
      ])
    );
    expect(mockAggregate).toHaveBeenCalledWith(
      [{ second: 1, score: 100 }],
      [{ second: 5, score: 90 }],
      120
    );
  });

  it('openAiApiKey が指定された場合、感情分析を実行して aggregate に emotionScores を渡す', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    mockTranscribe.mockResolvedValue([{ start: 1.0, end: 3.0, text: 'やばい！' }]);
    mockGetScores.mockResolvedValue([{ second: 1, score: 0.9, dominantEmotion: 'excite' }]);
    mockAggregate.mockReturnValue([
      { startSec: 0, endSec: 11, score: 0.9, source: 'emotion', dominantEmotion: 'excite' },
    ]);

    const inputWithKey: QuickClipBatchRunInput = {
      ...input,
      openAiApiKey: 'sk-test-key',
      emotionFilter: 'excite',
    };
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();

    expect(mockTranscribe).toHaveBeenCalledWith('/tmp/quick-clip/job-1/input.mp4');
    expect(mockGetScores).toHaveBeenCalledWith(
      [{ start: 1.0, end: 3.0, text: 'やばい！' }],
      'excite'
    );
    expect(mockAggregate).toHaveBeenCalledWith([], [], 120, [
      { second: 1, score: 0.9, dominantEmotion: 'excite' },
    ]);
    expect(mockCreateMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'emotion',
          dominantEmotion: 'excite',
          status: 'unconfirmed',
          clipStatus: 'PENDING',
          expiresAt: JOB_EXPIRES_AT,
        }),
      ])
    );
  });

  it('openAiApiKey が指定されても transcribe が空配列を返した場合、getScores は呼ばれない', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    mockTranscribe.mockResolvedValue([]);

    const inputWithKey: QuickClipBatchRunInput = { ...input, openAiApiKey: 'sk-test-key' };
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();

    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    expect(mockGetScores).not.toHaveBeenCalled();
    expect(mockAggregate).toHaveBeenCalledWith([], [], 120);
  });

  it('感情分析が失敗した場合は graceful degradation で motion・volume のみで処理を継続する', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    mockTranscribe.mockRejectedValue(new Error('transcription failed'));

    const inputWithKey: QuickClipBatchRunInput = { ...input, openAiApiKey: 'sk-test-key' };
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();

    expect(mockAggregate).toHaveBeenCalledWith([], [], 120);
    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'aggregating');
    expect(mockUpdateErrorMessage).not.toHaveBeenCalled();
  });

  it('getScores が失敗した場合も graceful degradation で motion・volume のみで処理を継続する', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    mockTranscribe.mockResolvedValue([{ start: 0, end: 1, text: 'テスト' }]);
    mockGetScores.mockRejectedValue(new Error('emotion API error'));

    const inputWithKey: QuickClipBatchRunInput = { ...input, openAiApiKey: 'sk-test-key' };
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();

    expect(mockAggregate).toHaveBeenCalledWith([], [], 120);
    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'aggregating');
    expect(mockUpdateErrorMessage).not.toHaveBeenCalled();
  });
});
