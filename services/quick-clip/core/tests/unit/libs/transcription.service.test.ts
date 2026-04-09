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
        { start: 0.0, end: 5.0, text: 'やばい！これは面白すぎるwww' },
        { start: 5.3, end: 10.0, text: 'マジで？どういうことだよ' },
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
        model: 'gpt-4o-mini-transcribe',
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
      expect.arrayContaining(['-i', '/tmp/video.mp4', '-vn', '-f', 'wav'])
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('API 呼び出し後に一時ファイルを削除する', async () => {
    mockCreate.mockResolvedValue({ text: '', segments: [] });
    const { unlink } = jest.requireMock<{ unlink: jest.Mock }>('node:fs/promises');

    const service = new TranscriptionService(mockClient);
    await service.transcribe('/tmp/video.mp4');

    expect(unlink).toHaveBeenCalledWith('/tmp/quick-clip-audio-test-uuid.wav');
  });

  it('API エラー時でも一時ファイルを削除する', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));
    const { unlink } = jest.requireMock<{ unlink: jest.Mock }>('node:fs/promises');

    const service = new TranscriptionService(mockClient);
    await expect(service.transcribe('/tmp/video.mp4')).rejects.toThrow('API error');

    expect(unlink).toHaveBeenCalledWith('/tmp/quick-clip-audio-test-uuid.wav');
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
});
