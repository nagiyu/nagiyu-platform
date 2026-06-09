const mockS3Send = jest.fn();
const mockMkdir = jest.fn();
const mockStat = jest.fn();
const mockCreateWriteStream = jest.fn();
const mockCreateReadStream = jest.fn();
const mockPipeline = jest.fn();
const mockUpdateBatchStage = jest.fn();
const mockUpdateErrorMessage = jest.fn();
const mockUpdateAnalysisProgress = jest.fn();
const mockGetJob = jest.fn();
const mockCreateMany = jest.fn();
const mockAggregate = jest.fn();
const mockGetDurationSec = jest.fn();
const mockAnalyzeMotion = jest.fn();
const mockAnalyzeVolume = jest.fn();
const mockTranscribe = jest.fn();
const mockGetScores = jest.fn();
const mockSpawn = jest.fn();
const mockPutObjectCommand = jest.fn().mockImplementation((input: unknown) => input);
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
  PutObjectCommand: mockPutObjectCommand,
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
  createReadStream: mockCreateReadStream,
}));

jest.mock('node:stream/promises', () => ({
  pipeline: mockPipeline,
}));

jest.mock('node:child_process', () => ({
  spawn: mockSpawn,
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
    updateAnalysisProgress: mockUpdateAnalysisProgress,
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

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

import { reportErrorEvent } from '@nagiyu/aws';
import {
  runQuickClipBatch,
  type QuickClipBatchRunInput,
} from '../../../src/libs/quick-clip-batch-runner.js';

const reportErrorEventMock = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

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
    mockCreateReadStream.mockReturnValue({} as NodeJS.ReadableStream);
    mockPipeline.mockResolvedValue(undefined);
    mockCreateMany.mockResolvedValue(undefined);
    mockAggregate.mockReturnValue([]);
    mockGetDurationSec.mockResolvedValue(120);
    mockAnalyzeMotion.mockResolvedValue([]);
    mockAnalyzeVolume.mockResolvedValue([]);
    mockUpdateBatchStage.mockResolvedValue(undefined);
    mockUpdateErrorMessage.mockResolvedValue(undefined);
    mockUpdateAnalysisProgress.mockResolvedValue(undefined);
    mockGetJob.mockResolvedValue({ expiresAt: JOB_EXPIRES_AT });
    mockTranscribe.mockResolvedValue([]);
    mockGetScores.mockResolvedValue([]);
    mockSpawn.mockImplementation(() => ({
      stderr: { on: jest.fn() },
      on: jest.fn().mockImplementation((event: string, handler: (code: number) => void) => {
        if (event === 'close') {
          handler(0);
        }
      }),
    }));
  });

  it('analyzeMotion と analyzeVolume に duration が渡されること', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    mockGetDurationSec.mockResolvedValue(1200);

    await expect(runQuickClipBatch(input)).resolves.toBeUndefined();

    expect(mockAnalyzeMotion).toHaveBeenCalledWith('/tmp/quick-clip/job-1/input.mp4', 1200);
    expect(mockAnalyzeVolume).toHaveBeenCalledWith('/tmp/quick-clip/job-1/input.mp4', 1200);
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
    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'clipping');
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
    expect(reportErrorEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'error',
        message: 'アップロード済みの動画ファイルが見つかりません: uploads/job-1/input.mp4',
        context: expect.objectContaining({ jobId: 'job-1', command: 'extract' }),
      })
    );
  });

  it('extract コマンドで生成する見どころは clipStatus を GENERATED で保存する', async () => {
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
          clipStatus: 'GENERATED',
          expiresAt: JOB_EXPIRES_AT,
        }),
        expect.objectContaining({
          jobId: 'job-1',
          startSec: 5,
          endSec: 8,
          order: 2,
          source: 'volume',
          status: 'unconfirmed',
          clipStatus: 'GENERATED',
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

  it('clipping ステージで全ハイライトが切り出され S3 にアップロードされること', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    mockAggregate.mockReturnValue([
      { startSec: 0, endSec: 5, source: 'motion' },
      { startSec: 10, endSec: 15, source: 'volume' },
    ]);

    await expect(runQuickClipBatch(input)).resolves.toBeUndefined();

    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'clipping');
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', [
      '-hide_banner',
      '-ss',
      '0',
      '-t',
      '5',
      '-i',
      '/tmp/quick-clip/job-1/input.mp4',
      '-c',
      'copy',
      '-y',
      expect.stringContaining('/tmp/quick-clip/job-1/clips/'),
    ]);
    expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', [
      '-hide_banner',
      '-ss',
      '10',
      '-t',
      '5',
      '-i',
      '/tmp/quick-clip/job-1/input.mp4',
      '-c',
      'copy',
      '-y',
      expect.stringContaining('/tmp/quick-clip/job-1/clips/'),
    ]);
    expect(mockPutObjectCommand).toHaveBeenCalledTimes(2);
    expect(mockPutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'bucket',
        Key: expect.stringMatching(/^outputs\/job-1\/clips\/.+\.mp4$/),
      })
    );
    expect(mockCreateMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ clipStatus: 'GENERATED' })])
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

    expect(mockTranscribe).toHaveBeenCalledWith(
      '/tmp/quick-clip/job-1/input.mp4',
      expect.any(Function)
    );
    expect(mockGetScores).toHaveBeenCalledWith(
      [{ start: 1.0, end: 3.0, text: 'やばい！' }],
      'excite',
      expect.any(Function)
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
          clipStatus: 'GENERATED',
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
    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'clipping');
    expect(mockUpdateBatchStage).toHaveBeenCalledWith('job-1', 'aggregating');
    expect(mockUpdateErrorMessage).not.toHaveBeenCalled();
  });

  it('感情分析の getScores が失敗した場合は reportErrorEvent を warning で呼びつつ処理を継続する', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    mockTranscribe.mockResolvedValue([{ start: 1.0, end: 3.0, text: 'やばい！' }]);
    mockGetScores.mockRejectedValue(new Error('emotion api failed'));

    const inputWithKey: QuickClipBatchRunInput = { ...input, openAiApiKey: 'sk-test-key' };
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();

    expect(reportErrorEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'warning',
        message: 'emotion api failed',
        context: expect.objectContaining({ jobId: 'job-1', stage: 'emotionScoring' }),
      })
    );
    expect(mockUpdateErrorMessage).not.toHaveBeenCalled();
  });

  it('openAiApiKey がない場合、初期進捗は motion・volume のみで設定される', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });

    await expect(runQuickClipBatch(input)).resolves.toBeUndefined();

    expect(mockUpdateAnalysisProgress).toHaveBeenCalledWith('job-1', {
      motion: { status: 'in_progress' },
      volume: { status: 'in_progress' },
    });
    expect(mockUpdateAnalysisProgress).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        motion: { status: 'done' },
      })
    );
    expect(mockUpdateAnalysisProgress).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        volume: { status: 'done' },
      })
    );
  });

  it('openAiApiKey が指定された場合、初期進捗に transcription が含まれる', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });

    const inputWithKey: QuickClipBatchRunInput = { ...input, openAiApiKey: 'sk-test-key' };
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();

    expect(mockUpdateAnalysisProgress).toHaveBeenCalledWith('job-1', {
      motion: { status: 'in_progress' },
      volume: { status: 'in_progress' },
      transcription: { status: 'in_progress' },
    });
  });

  it('文字起こし失敗時は transcription の status が failed になる', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    mockTranscribe.mockRejectedValue(new Error('transcription failed'));

    const inputWithKey: QuickClipBatchRunInput = { ...input, openAiApiKey: 'sk-test-key' };
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();

    const calls = mockUpdateAnalysisProgress.mock.calls as Array<[string, unknown]>;
    const failCall = calls.find(
      ([, p]) =>
        typeof p === 'object' &&
        p !== null &&
        (p as Record<string, unknown>).transcription !== undefined &&
        (p as Record<string, { status: string }>).transcription.status === 'failed'
    );
    expect(failCall).toBeDefined();
  });

  it('transcript 保存: segments が1件以上の場合、transcript.json を S3 に PutObject する', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    const segments = [{ start: 0.0, end: 3.5, text: 'やばい！' }];
    mockTranscribe.mockResolvedValue(segments);

    const inputWithKey: QuickClipBatchRunInput = { ...input, openAiApiKey: 'sk-test-key' };
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();

    // PutObjectCommand がクリップ用と transcript 用で呼ばれていること
    const transcriptCall = (
      mockPutObjectCommand.mock.calls as Array<[Record<string, unknown>]>
    ).find(
      ([args]) => typeof args.Key === 'string' && args.Key === `outputs/job-1/transcript.json`
    );
    expect(transcriptCall).toBeDefined();
    expect(transcriptCall?.[0]).toMatchObject({
      Bucket: 'bucket',
      Key: 'outputs/job-1/transcript.json',
      Body: JSON.stringify(segments),
      ContentType: 'application/json',
    });
  });

  it('transcript 保存: segments が 0 件の場合、transcript.json を S3 に保存しない', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });
    mockTranscribe.mockResolvedValue([]);

    const inputWithKey: QuickClipBatchRunInput = { ...input, openAiApiKey: 'sk-test-key' };
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();

    const transcriptCall = (
      mockPutObjectCommand.mock.calls as Array<[Record<string, unknown>]>
    ).find(
      ([args]) => typeof args.Key === 'string' && args.Key === `outputs/job-1/transcript.json`
    );
    expect(transcriptCall).toBeUndefined();
  });

  it('transcript 保存: openAiApiKey が未指定の場合、transcript.json を保存しない', async () => {
    mockS3Send.mockResolvedValue({ Body: { pipe: jest.fn() } });

    await expect(runQuickClipBatch(input)).resolves.toBeUndefined();

    const transcriptCall = (
      mockPutObjectCommand.mock.calls as Array<[Record<string, unknown>]>
    ).find(
      ([args]) => typeof args.Key === 'string' && args.Key === `outputs/job-1/transcript.json`
    );
    expect(transcriptCall).toBeUndefined();
  });

  it('transcript 保存: S3 保存が失敗しても抽出処理全体は成功する', async () => {
    // ダウンロード成功、クリップ S3 PUT 成功、transcript PUT だけ失敗させる
    // PutObjectCommand は mockPutObjectCommand でモックしており、引数を返す
    // sendに渡るのはそのモックの戻り値（inputそのもの）なので Key で判定可能
    mockS3Send.mockImplementation(async (cmd: unknown) => {
      const command = cmd as Record<string, unknown>;
      const key = command.Key as string | undefined;
      if (key !== undefined && key.endsWith('transcript.json')) {
        throw new Error('S3 保存失敗');
      }
      // ダウンロード用（Body付き）またはクリップ PUT 用
      return { Body: { pipe: jest.fn() } };
    });
    const segments = [{ start: 0.0, end: 3.5, text: 'テスト' }];
    mockTranscribe.mockResolvedValue(segments);

    const inputWithKey: QuickClipBatchRunInput = { ...input, openAiApiKey: 'sk-test-key' };
    // transcript 保存失敗でも全体は resolve する
    await expect(runQuickClipBatch(inputWithKey)).resolves.toBeUndefined();
    // エラーメッセージは記録されない
    expect(mockUpdateErrorMessage).not.toHaveBeenCalled();
  });
});
