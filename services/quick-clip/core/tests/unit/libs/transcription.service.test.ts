import { EventEmitter } from 'node:events';
import {
  TranscriptionService,
  buildSpeechRanges,
  parseDurationSec,
  parseSilences,
} from '../../../src/libs/transcription.service.js';

const mockCreate = jest.fn();
const mockUnlink = jest.fn().mockResolvedValue(undefined);

jest.mock('node:fs', () => ({
  createReadStream: jest.fn(() => 'mock-stream'),
}));

jest.mock('node:fs/promises', () => ({
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
}));

const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

const mockClient = {
  audio: { transcriptions: { create: mockCreate } },
} as never;

type FfmpegResult = { exitCode?: number; stderr?: string; spawnError?: Error };

const createFfmpegProcess = ({ exitCode = 0, stderr = '', spawnError }: FfmpegResult) => {
  const proc = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  proc.stderr = new EventEmitter();
  setImmediate(() => {
    if (spawnError) {
      proc.emit('error', spawnError);
      return;
    }
    if (stderr) {
      proc.stderr.emit('data', Buffer.from(stderr));
    }
    proc.emit('close', exitCode);
  });
  return proc;
};

/** silencedetect を含む呼び出しにだけ検出結果を返し、それ以外は成功させる */
const setupFfmpeg = (detectOutput: string, overrides: { extract?: FfmpegResult } = {}) => {
  mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
    if (args.includes('-af')) {
      return createFfmpegProcess({ stderr: detectOutput });
    }
    if (args.includes('libmp3lame')) {
      return createFfmpegProcess(overrides.extract ?? {});
    }
    return createFfmpegProcess({});
  });
};

// 0-2 秒が無音、2-5 秒が発話、5-6.5 秒が無音、6.5-8.6 秒が発話
const DETECT_OUTPUT = [
  '  Duration: 00:00:08.60, start: 0.069063, bitrate: 32 kb/s',
  '[silencedetect @ 0x1] silence_start: 0',
  '[silencedetect @ 0x1] silence_end: 2.00013 | silence_duration: 2.00013',
  '[silencedetect @ 0x1] silence_start: 5',
  '[silencedetect @ 0x1] silence_end: 6.5 | silence_duration: 1.5',
].join('\n');

/** 偽タイマーのまま、再試行の待ち時間を進めつつ完了を待つ */
const advanceUntilSettled = async (promise: Promise<unknown>): Promise<void> => {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  for (let i = 0; i < 100 && !settled; i += 1) {
    await jest.advanceTimersByTimeAsync(2000);
    await new Promise((resolve) => setImmediate(resolve));
  }
};

describe('parseDurationSec', () => {
  it('Duration 行から秒数を取り出す', () => {
    expect(parseDurationSec('  Duration: 01:02:03.50, start: 0')).toBeCloseTo(3723.5);
  });

  it('Duration 行が無ければ null を返す', () => {
    expect(parseDurationSec('no duration')).toBeNull();
  });
});

describe('parseSilences', () => {
  it('start と end の組を無音区間にする', () => {
    expect(parseSilences(DETECT_OUTPUT)).toEqual([
      { start: 0, end: 2.00013 },
      { start: 5, end: 6.5 },
    ]);
  });

  it('end が無い無音 (末尾まで続く無音) は end が undefined になる', () => {
    expect(parseSilences('silence_start: 3.5')).toEqual([{ start: 3.5 }]);
  });

  it('負の start は 0 に丸める', () => {
    expect(parseSilences('silence_start: -0.01\nsilence_end: 1 | silence_duration: 1')).toEqual([
      { start: 0, end: 1 },
    ]);
  });

  it('start に対応しない end は無視する', () => {
    expect(parseSilences('silence_end: 1 | silence_duration: 1')).toEqual([]);
  });

  it('無音が無ければ空配列を返す', () => {
    expect(parseSilences('')).toEqual([]);
  });
});

describe('buildSpeechRanges', () => {
  it('無音が無ければ全体を 1 区間にする', () => {
    expect(buildSpeechRanges([], 10)).toEqual([{ start: 0, end: 10 }]);
  });

  it('先頭が無音なら発話の開始まで飛ばす (余白付き)', () => {
    const ranges = buildSpeechRanges([{ start: 0, end: 2 }], 10);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBeCloseTo(1.8);
    expect(ranges[0].end).toBeCloseTo(10);
  });

  it('末尾が無音なら発話の終了で止める (余白付き)', () => {
    const ranges = buildSpeechRanges([{ start: 6 }], 10);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(0);
    expect(ranges[0].end).toBeCloseTo(6.2);
  });

  it('無音で挟まれた発話ごとに区間を作る', () => {
    const ranges = buildSpeechRanges(
      [
        { start: 0, end: 2 },
        { start: 5, end: 6.5 },
      ],
      8.6
    );
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBeCloseTo(1.8);
    expect(ranges[0].end).toBeCloseTo(5.2);
    expect(ranges[1].start).toBeCloseTo(6.3);
    expect(ranges[1].end).toBeCloseTo(8.6);
  });

  it('全体が無音なら区間は無い', () => {
    expect(buildSpeechRanges([{ start: 0 }], 10)).toEqual([]);
  });

  it('長い区間は最大長以下に等分する', () => {
    const ranges = buildSpeechRanges([], 70);
    expect(ranges).toHaveLength(3);
    for (const r of ranges) {
      expect(r.end - r.start).toBeLessThanOrEqual(30);
    }
    expect(ranges[0].start).toBe(0);
    expect(ranges[2].end).toBeCloseTo(70);
    expect(ranges[1].start).toBeCloseTo(ranges[0].end);
  });

  it('短すぎる区間は除外する', () => {
    // 無音 5 秒の直後の発話が 0.05 秒。余白を足せば 0.3 秒を超えるが、判定は余白を足す前の長さで行う
    const ranges = buildSpeechRanges(
      [
        { start: 0, end: 5 },
        { start: 5.05, end: 20 },
      ],
      20
    );
    expect(ranges).toEqual([]);
  });
});

describe('TranscriptionService', () => {
  let service: TranscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setupFfmpeg(DETECT_OUTPUT);
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ text: 'こんにちは' });
    mockUnlink.mockResolvedValue(undefined);
    service = new TranscriptionService(mockClient);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('区間ごとに文字起こしし、区間の開始・終了を start・end にする', async () => {
    mockCreate
      .mockResolvedValueOnce({ text: ' 一つ目 ' })
      .mockResolvedValueOnce({ text: '二つ目' });

    const result = await service.transcribe('/tmp/video.mp4');

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('一つ目');
    expect(result[0].start).toBeCloseTo(1.8);
    expect(result[0].end).toBeCloseTo(5.2);
    expect(result[1].text).toBe('二つ目');
    expect(result[1].start).toBeCloseTo(6.3);
    expect(result[1].end).toBeCloseTo(8.6);
  });

  it('gpt-transcribe を languages 指定で呼ぶ', async () => {
    await service.transcribe('/tmp/video.mp4');

    expect(mockCreate).toHaveBeenCalledWith(
      {
        model: 'gpt-transcribe',
        file: 'mock-stream',
        languages: ['ja'],
      },
      { signal: expect.any(AbortSignal) }
    );
  });

  it('タイムアウトしたら HTTP 要求も中断する', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const signals: AbortSignal[] = [];
    mockCreate.mockImplementation((_body: unknown, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      return new Promise(() => undefined);
    });

    const promise = service.transcribe('/tmp/video.mp4');
    const assertion = expect(promise).rejects.toThrow('タイムアウト');
    // ffmpeg の疑似プロセスが setImmediate で進むため、API 呼び出しに届くまで回す
    for (let i = 0; i < 20 && signals.length === 0; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(signals[0].aborted).toBe(true);

    await advanceUntilSettled(promise);
    await assertion;
  });

  it('区間の切り出しで -ss と -t を指数表記にせず小数 3 桁で渡す', async () => {
    await service.transcribe('/tmp/video.mp4');

    const rangeCalls = mockSpawn.mock.calls
      .map((c) => c[1] as string[])
      .filter((args) => args.includes('-ss'));
    expect(rangeCalls).toHaveLength(2);
    const first = rangeCalls.find((args) => args[args.indexOf('-ss') + 1] === '1.800');
    expect(first).toBeDefined();
    expect(first?.[(first?.indexOf('-t') ?? 0) + 1]).toBe('3.400');
  });

  it('末尾の無音にも EOF で silence_end が出るとき、末尾の極短い区間は捨てる', async () => {
    // 末尾の無音が 11 秒で終わり、Duration は 11.09 秒。10.0-11 は無音、11-11.09 は 0.09 秒の端数
    setupFfmpeg(
      [
        '  Duration: 00:00:11.09, start: 0.069063, bitrate: 32 kb/s',
        'silence_start: 5',
        'silence_end: 11 | silence_duration: 6',
      ].join('\n')
    );

    const result = await service.transcribe('/tmp/video.mp4');

    expect(result).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('失敗後は進捗通知も新規着手もせず、全 worker の終了を待ってから reject し、その後に一時ファイルを削除する', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const events: string[] = [];
    let releaseSlow: (value: { text: string }) => void = () => undefined;
    let call = 0;
    mockCreate.mockImplementation(() => {
      call += 1;
      if (call === 2) {
        return new Promise((resolve) => {
          releaseSlow = resolve;
        });
      }
      return Promise.reject(new Error('API エラー'));
    });
    mockUnlink.mockImplementation(async (path: string) => {
      events.push(`unlink:${path}`);
    });
    const onProgress = jest.fn(async () => {
      events.push('progress');
    });

    const promise = service.transcribe('/tmp/video.mp4', onProgress);
    let settled = false;
    const assertion = expect(promise).rejects.toThrow('API エラー');
    void promise.then(
      () => undefined,
      () => {
        settled = true;
        events.push('rejected');
      }
    );

    // 失敗した区間のリトライが尽きるまで進めても、遅い worker が終わるまで reject しない
    for (let i = 0; i < 30; i += 1) {
      await jest.advanceTimersByTimeAsync(2000);
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(settled).toBe(false);
    expect(events).not.toContain('unlink:/tmp/quick-clip-audio-test-uuid.mp3');

    releaseSlow({ text: '遅れて完了' });
    await advanceUntilSettled(promise);
    await assertion;

    expect(onProgress).not.toHaveBeenCalled();
    const rejectedAt = events.indexOf('rejected');
    const audioUnlinkAt = events.indexOf('unlink:/tmp/quick-clip-audio-test-uuid.mp3');
    expect(audioUnlinkAt).toBeGreaterThanOrEqual(0);
    expect(audioUnlinkAt).toBeLessThan(rejectedAt);
    expect(mockCreate).toHaveBeenCalledTimes(1 + 4);
  });

  it('空のテキストは行にしない', async () => {
    mockCreate.mockResolvedValueOnce({ text: '  ' }).mockResolvedValueOnce({ text: '残る' });

    const result = await service.transcribe('/tmp/video.mp4');

    expect(result.map((s) => s.text)).toEqual(['残る']);
  });

  it('発話区間が無ければ API を呼ばず空配列を返す', async () => {
    setupFfmpeg('  Duration: 00:00:05.00\n[silencedetect @ 0x1] silence_start: 0');

    const result = await service.transcribe('/tmp/video.mp4');

    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('onProgress を区間単位で呼ぶ', async () => {
    const onProgress = jest.fn().mockResolvedValue(undefined);

    await service.transcribe('/tmp/video.mp4', onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  it('同時リクエスト数は上限を超えない', async () => {
    // 1 秒の発話と 1 秒の無音を 8 回繰り返した出力
    const lines = ['  Duration: 00:00:16.00'];
    for (let i = 0; i < 8; i += 1) {
      lines.push(`silence_start: ${i * 2 + 1}`);
      lines.push(`silence_end: ${i * 2 + 2} | silence_duration: 1`);
    }
    setupFfmpeg(lines.join('\n'));

    let running = 0;
    let maxRunning = 0;
    mockCreate.mockImplementation(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
      return { text: 'あ' };
    });

    const result = await service.transcribe('/tmp/video.mp4');

    expect(result).toHaveLength(8);
    expect(maxRunning).toBeLessThanOrEqual(5);
    expect(maxRunning).toBeGreaterThan(1);
  });

  it('API が一度失敗しても再試行して成功する', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    mockCreate.mockRejectedValueOnce(new Error('一時的なエラー'));

    const promise = service.transcribe('/tmp/video.mp4');
    await advanceUntilSettled(promise);
    const result = await promise;

    expect(result).toHaveLength(2);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('API が失敗し続けたらエラーをスローし、一時ファイルを削除する', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    mockCreate.mockRejectedValue(new Error('API エラー'));

    const promise = service.transcribe('/tmp/video.mp4');
    const assertion = expect(promise).rejects.toThrow('API エラー');
    await advanceUntilSettled(promise);
    await assertion;

    const unlinked = mockUnlink.mock.calls.map((c) => c[0] as string);
    expect(unlinked).toContain('/tmp/quick-clip-audio-test-uuid.mp3');
    expect(unlinked).toContain('/tmp/quick-clip-audio-test-uuid-range.mp3');
  });

  it('正常終了時も一時ファイルを削除する', async () => {
    await service.transcribe('/tmp/video.mp4');

    expect(mockUnlink).toHaveBeenCalledWith('/tmp/quick-clip-audio-test-uuid.mp3');
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/quick-clip-audio-test-uuid-range.mp3');
  });

  it('一時ファイルの削除に失敗しても例外にしない', async () => {
    mockUnlink.mockRejectedValue(new Error('削除失敗'));

    await expect(service.transcribe('/tmp/video.mp4')).resolves.toHaveLength(2);
  });

  it('音声抽出の ffmpeg が失敗したら例外をスローする', async () => {
    setupFfmpeg(DETECT_OUTPUT, { extract: { exitCode: 1, stderr: 'boom' } });

    await expect(service.transcribe('/tmp/video.mp4')).rejects.toThrow('音声の抽出に失敗しました');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('ffmpeg の起動に失敗したら例外をスローする', async () => {
    mockSpawn.mockImplementation(() => createFfmpegProcess({ spawnError: new Error('ENOENT') }));

    await expect(service.transcribe('/tmp/video.mp4')).rejects.toThrow('ENOENT');
  });

  it('音声の長さが取れなければ例外をスローする', async () => {
    setupFfmpeg('silence_start: 1');

    await expect(service.transcribe('/tmp/video.mp4')).rejects.toThrow(
      '音声の長さを取得できませんでした'
    );
  });
});
