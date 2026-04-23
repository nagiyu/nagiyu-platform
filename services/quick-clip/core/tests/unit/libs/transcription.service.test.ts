import { EventEmitter } from 'node:events';
import { TranscriptionService } from '../../../src/libs/transcription.service.js';

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    audio: {
      transcriptions: {
        create: mockCreate,
      },
    },
  })),
}));

jest.mock('node:fs', () => ({
  createReadStream: jest.fn(() => 'mock-stream'),
}));

jest.mock('node:fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 1024 * 1024 }),
}));

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
}));

type SpawnMockOptions = {
  exitCode?: number;
  stderrData?: string;
  spawnError?: Error;
};

const createFfmpegMock = (options: SpawnMockOptions = {}) => {
  const { exitCode = 0, stderrData = '', spawnError } = options;
  const proc = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
  };
  proc.stderr = new EventEmitter();

  setImmediate(() => {
    if (spawnError) {
      proc.emit('error', spawnError);
      return;
    }
    if (stderrData) {
      proc.stderr.emit('data', Buffer.from(stderrData));
    }
    proc.emit('close', exitCode);
  });

  return proc;
};

const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

const mockClient = {
  audio: {
    transcriptions: {
      create: mockCreate,
    },
  },
} as never;

describe('TranscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawn.mockImplementation(() => createFfmpegMock());
  });

  it('正常系: セグメント付きレスポンスを TranscriptSegment[] に変換する', async () => {
    mockCreate.mockResolvedValue({
      text: 'やばい！これは面白すぎるwww',
      segments: [
        {
          start: 0.0,
          end: 5.0,
          text: 'やばい！これは面白すぎるwww',
          no_speech_prob: 0.1,
          avg_logprob: -0.5,
          compression_ratio: 1.0,
        },
        {
          start: 5.3,
          end: 10.0,
          text: 'マジで？どういうことだよ',
          no_speech_prob: 0.2,
          avg_logprob: -0.3,
          compression_ratio: 1.2,
        },
      ],
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/test.mp4');

    expect(result).toEqual([
      { start: 0.0, end: 5.0, text: 'やばい！これは面白すぎるwww' },
      { start: 5.3, end: 10.0, text: 'マジで？どういうことだよ' },
    ]);
  });

  it('segments が undefined の場合は空配列を返す', async () => {
    mockCreate.mockResolvedValue({
      text: '',
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/test.mp4');

    expect(result).toEqual([]);
  });

  it('segments が空配列の場合は空配列を返す', async () => {
    mockCreate.mockResolvedValue({
      text: '',
      segments: [],
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/test.mp4');

    expect(result).toEqual([]);
  });

  it('API エラー時は例外をそのままスローする', async () => {
    mockCreate.mockRejectedValue(new Error('OpenAI API error'));

    const service = new TranscriptionService(mockClient);

    await expect(service.transcribe('/tmp/test.mp4')).rejects.toThrow('OpenAI API error');
  });

  it('正しいパラメータで API が呼ばれる', async () => {
    mockCreate.mockResolvedValue({ text: '', segments: [] });

    const service = new TranscriptionService(mockClient);
    await service.transcribe('/tmp/video.mp4');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'whisper-1',
        response_format: 'verbose_json',
        language: 'ja',
      })
    );
  });

  it('ffmpeg で音声抽出してから API を呼ぶ', async () => {
    mockCreate.mockResolvedValue({ text: '', segments: [] });

    const service = new TranscriptionService(mockClient);
    await service.transcribe('/tmp/video.mp4');

    expect(mockSpawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining([
        '-i',
        '/tmp/video.mp4',
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '32k',
        '-f',
        'mp3',
      ])
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('API 呼び出し後に一時ファイルを削除する', async () => {
    mockCreate.mockResolvedValue({ text: '', segments: [] });
    const { unlink } = jest.requireMock<{ unlink: jest.Mock }>('node:fs/promises');

    const service = new TranscriptionService(mockClient);
    await service.transcribe('/tmp/video.mp4');

    expect(unlink).toHaveBeenCalledWith('/tmp/quick-clip-audio-test-uuid.mp3');
  });

  it('API エラー時でも一時ファイルを削除する', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));
    const { unlink } = jest.requireMock<{ unlink: jest.Mock }>('node:fs/promises');

    const service = new TranscriptionService(mockClient);
    await expect(service.transcribe('/tmp/video.mp4')).rejects.toThrow('API error');

    expect(unlink).toHaveBeenCalledWith('/tmp/quick-clip-audio-test-uuid.mp3');
  });

  it('ffmpeg が失敗した場合は例外をスローする', async () => {
    mockSpawn.mockImplementation(() => createFfmpegMock({ exitCode: 1, stderrData: 'error' }));

    const service = new TranscriptionService(mockClient);

    await expect(service.transcribe('/tmp/video.mp4')).rejects.toThrow('音声の抽出に失敗しました');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('ffmpeg spawn エラー時は例外をスローする', async () => {
    mockSpawn.mockImplementation(() => createFfmpegMock({ spawnError: new Error('spawn failed') }));

    const service = new TranscriptionService(mockClient);

    await expect(service.transcribe('/tmp/video.mp4')).rejects.toThrow('音声の抽出に失敗しました');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('24MB 超のファイルはチャンク分割して送信する', async () => {
    const { stat } = jest.requireMock<{ stat: jest.Mock }>('node:fs/promises');
    stat.mockResolvedValue({ size: 25 * 1024 * 1024 });

    mockCreate
      .mockResolvedValueOnce({
        text: '',
        segments: [
          {
            start: 0.0,
            end: 5.0,
            text: 'chunk1',
            no_speech_prob: 0.1,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
        ],
      })
      .mockResolvedValueOnce({
        text: '',
        segments: [
          {
            start: 1.0,
            end: 3.0,
            text: 'chunk2',
            no_speech_prob: 0.1,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
        ],
      });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/video.mp4');

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].start).toBe(0.0);
    expect(result[0].end).toBe(5.0);
    expect(result[0].text).toBe('chunk1');
  });

  it('2 チャンク目のタイムスタンプにオフセットが加算される', async () => {
    // CHUNK_DURATION_SEC = Math.floor(24 * 1024 * 1024 / 4000) = 6291
    const expectedChunkDurationSec = 6291;
    const { stat } = jest.requireMock<{ stat: jest.Mock }>('node:fs/promises');
    stat.mockResolvedValue({ size: 25 * 1024 * 1024 });

    mockCreate
      .mockResolvedValueOnce({
        text: '',
        segments: [
          {
            start: 0.0,
            end: 5.0,
            text: 'chunk1',
            no_speech_prob: 0.1,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
        ],
      })
      .mockResolvedValueOnce({
        text: '',
        segments: [
          {
            start: 1.0,
            end: 3.0,
            text: 'chunk2',
            no_speech_prob: 0.1,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
        ],
      });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/video.mp4');

    expect(result[1].start).toBeCloseTo(1.0 + expectedChunkDurationSec);
    expect(result[1].end).toBeCloseTo(3.0 + expectedChunkDurationSec);
    expect(result[1].text).toBe('chunk2');
  });

  it('チャンク API エラー時にチャンクファイルを削除する', async () => {
    const { stat, unlink } = jest.requireMock<{ stat: jest.Mock; unlink: jest.Mock }>(
      'node:fs/promises'
    );
    stat.mockResolvedValue({ size: 25 * 1024 * 1024 });
    mockCreate.mockRejectedValue(new Error('API error'));

    const service = new TranscriptionService(mockClient);
    await expect(service.transcribe('/tmp/video.mp4')).rejects.toThrow('API error');

    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('-chunk-0.mp3'));
    expect(unlink).toHaveBeenCalledWith('/tmp/quick-clip-audio-test-uuid.mp3');
  });

  it('no_speech_prob > 0.6 のセグメントが除外される', async () => {
    const { stat } = jest.requireMock<{ stat: jest.Mock }>('node:fs/promises');
    stat.mockResolvedValue({ size: 1024 * 1024 });
    mockCreate.mockResolvedValue({
      text: '',
      segments: [
        {
          start: 0.0,
          end: 5.0,
          text: '正常セグメント',
          no_speech_prob: 0.1,
          avg_logprob: -0.5,
          compression_ratio: 1.0,
        },
        {
          start: 5.0,
          end: 10.0,
          text: 'ハルシネーション',
          no_speech_prob: 0.7,
          avg_logprob: -0.5,
          compression_ratio: 1.0,
        },
      ],
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/video.mp4');

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('正常セグメント');
  });

  it('avg_logprob < -1.0 のセグメントが除外される', async () => {
    const { stat } = jest.requireMock<{ stat: jest.Mock }>('node:fs/promises');
    stat.mockResolvedValue({ size: 1024 * 1024 });
    mockCreate.mockResolvedValue({
      text: '',
      segments: [
        {
          start: 0.0,
          end: 5.0,
          text: '正常セグメント',
          no_speech_prob: 0.1,
          avg_logprob: -0.5,
          compression_ratio: 1.0,
        },
        {
          start: 5.0,
          end: 10.0,
          text: '不確かなセグメント',
          no_speech_prob: 0.1,
          avg_logprob: -1.5,
          compression_ratio: 1.0,
        },
      ],
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/video.mp4');

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('正常セグメント');
  });

  it('compression_ratio > 2.4 のセグメントが除外される', async () => {
    const { stat } = jest.requireMock<{ stat: jest.Mock }>('node:fs/promises');
    stat.mockResolvedValue({ size: 1024 * 1024 });
    mockCreate.mockResolvedValue({
      text: '',
      segments: [
        {
          start: 0.0,
          end: 5.0,
          text: '正常セグメント',
          no_speech_prob: 0.1,
          avg_logprob: -0.5,
          compression_ratio: 1.0,
        },
        {
          start: 5.0,
          end: 10.0,
          text: '繰り返しセグメント',
          no_speech_prob: 0.1,
          avg_logprob: -0.5,
          compression_ratio: 2.5,
        },
      ],
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/video.mp4');

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('正常セグメント');
  });

  it('境界値のセグメントは保持される（閾値と同値は許容）', async () => {
    const { stat } = jest.requireMock<{ stat: jest.Mock }>('node:fs/promises');
    stat.mockResolvedValue({ size: 1024 * 1024 });
    mockCreate.mockResolvedValue({
      text: '',
      segments: [
        {
          start: 0.0,
          end: 5.0,
          text: 'セグメント1',
          no_speech_prob: 0.0,
          avg_logprob: -0.1,
          compression_ratio: 1.0,
        },
        {
          start: 5.0,
          end: 10.0,
          text: 'セグメント2',
          no_speech_prob: 0.6,
          avg_logprob: -1.0,
          compression_ratio: 2.4,
        },
      ],
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/video.mp4');

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('セグメント1');
    expect(result[1].text).toBe('セグメント2');
  });

  it('チャンク分割時もフィルタリングが機能する', async () => {
    const { stat } = jest.requireMock<{ stat: jest.Mock }>('node:fs/promises');
    stat.mockResolvedValue({ size: 25 * 1024 * 1024 });

    mockCreate
      .mockResolvedValueOnce({
        text: '',
        segments: [
          {
            start: 0.0,
            end: 5.0,
            text: '正常チャンク1',
            no_speech_prob: 0.1,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
          {
            start: 5.0,
            end: 10.0,
            text: 'ハルシネーション',
            no_speech_prob: 0.9,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
        ],
      })
      .mockResolvedValueOnce({
        text: '',
        segments: [
          {
            start: 0.0,
            end: 3.0,
            text: '正常チャンク2',
            no_speech_prob: 0.1,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
        ],
      });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/video.mp4');

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('正常チャンク1');
    expect(result[1].text).toBe('正常チャンク2');
  });

  it('並列化: 複数チャンクが Promise.all で並列処理されタイムスタンプ順に結合される', async () => {
    // CHUNK_DURATION_SEC = Math.floor(24 * 1024 * 1024 / 4000) = 6291
    const expectedChunkDurationSec = 6291;
    const { stat } = jest.requireMock<{ stat: jest.Mock }>('node:fs/promises');
    // 3チャンク相当のサイズ: 3 * CHUNK_DURATION_SEC * MP3_BYTES_PER_SEC (ちょうど3チャンクになるよう設定)
    stat.mockResolvedValue({ size: 3 * expectedChunkDurationSec * 4000 });

    mockCreate
      .mockResolvedValueOnce({
        text: '',
        segments: [
          {
            start: 0.0,
            end: 5.0,
            text: 'chunk1',
            no_speech_prob: 0.1,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
        ],
      })
      .mockResolvedValueOnce({
        text: '',
        segments: [
          {
            start: 1.0,
            end: 3.0,
            text: 'chunk2',
            no_speech_prob: 0.1,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
        ],
      })
      .mockResolvedValueOnce({
        text: '',
        segments: [
          {
            start: 2.0,
            end: 4.0,
            text: 'chunk3',
            no_speech_prob: 0.1,
            avg_logprob: -0.5,
            compression_ratio: 1.0,
          },
        ],
      });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/video.mp4');

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('chunk1');
    expect(result[1].text).toBe('chunk2');
    expect(result[1].start).toBeCloseTo(1.0 + expectedChunkDurationSec);
    expect(result[2].text).toBe('chunk3');
    expect(result[2].start).toBeCloseTo(2.0 + 2 * expectedChunkDurationSec);
  });
});
