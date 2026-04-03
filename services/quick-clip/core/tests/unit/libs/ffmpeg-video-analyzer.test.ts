import { FfmpegVideoAnalyzer } from '../../../src/libs/ffmpeg-video-analyzer.js';
import { EventEmitter } from 'node:events';

const spawnMock = jest.fn();

jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

type MockFfmpegProcess = EventEmitter & { stderr: EventEmitter };

const createFfmpegProcessMock = (stderrOutput: string, code = 0): MockFfmpegProcess => {
  const ffmpegProcess = new EventEmitter() as MockFfmpegProcess;
  ffmpegProcess.stderr = new EventEmitter();
  setImmediate(() => {
    ffmpegProcess.stderr.emit('data', Buffer.from(stderrOutput));
    ffmpegProcess.emit('close', code);
  });
  return ffmpegProcess;
};

describe('FfmpegVideoAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('analyzeMotion: metadata が改行される形式でも scene_score を抽出できる', async () => {
    spawnMock.mockReturnValue(
      createFfmpegProcessMock(
        [
          'frame:1 pts:100 pts_time:10.5',
          'lavfi.scene_score=0.44',
          'frame:2 pts:200 pts_time:20.2',
          'lavfi.scene_score=0.30',
        ].join('\n')
      )
    );

    const analyzer = new FfmpegVideoAnalyzer();
    const result = await analyzer.analyzeMotion('/tmp/input.mp4');

    expect(result).toEqual([
      { second: 10.5, score: 0.44 },
      { second: 20.2, score: 0.3 },
    ]);
  });

  it('analyzeMotion: 不正な scene_score は除外される', async () => {
    spawnMock.mockReturnValue(
      createFfmpegProcessMock(
        [
          'frame:1 pts:100 pts_time:10.5',
          'lavfi.scene_score=abc',
          'frame:2 pts:200 pts_time:20.2',
          'lavfi.scene_score=0.30',
        ].join('\n')
      )
    );

    const analyzer = new FfmpegVideoAnalyzer();
    const result = await analyzer.analyzeMotion('/tmp/input.mp4');

    expect(result).toEqual([{ second: 20.2, score: 0.3 }]);
  });

  it('analyzeVolume: metadata が改行される形式でも RMS_level を抽出できる', async () => {
    spawnMock.mockReturnValue(
      createFfmpegProcessMock(
        [
          '30 fps',
          'frame:300 pts:0 pts_time:10.0',
          'lavfi.astats.Overall.RMS_level=-20.0',
          'frame:630 pts:0 pts_time:21.0',
          'lavfi.astats.Overall.RMS_level=-30.0',
        ].join('\n')
      )
    );

    const analyzer = new FfmpegVideoAnalyzer();
    const result = await analyzer.analyzeVolume('/tmp/input.mp4');
    const expectedScoreFromMinus20dB = Math.pow(10, -20 / 20);
    const expectedScoreFromMinus30dB = Math.pow(10, -30 / 20);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ second: 10 });
    expect(result[1]).toMatchObject({ second: 21 });
    expect(result[0]!.score).toBeCloseTo(expectedScoreFromMinus20dB, 6);
    expect(result[1]!.score).toBeCloseTo(expectedScoreFromMinus30dB, 6);
  });

  it('analyzeVolume: 不正な RMS_level は除外される', async () => {
    spawnMock.mockReturnValue(
      createFfmpegProcessMock(
        [
          '30 fps',
          'frame:300 pts:0 pts_time:10.0',
          'lavfi.astats.Overall.RMS_level=abc',
          'frame:630 pts:0 pts_time:21.0',
          'lavfi.astats.Overall.RMS_level=-30.0',
        ].join('\n')
      )
    );

    const analyzer = new FfmpegVideoAnalyzer();
    const result = await analyzer.analyzeVolume('/tmp/input.mp4');
    const expectedScoreFromMinus30dB = Math.pow(10, -30 / 20);

    expect(result).toEqual([
      {
        second: 21,
        score: expectedScoreFromMinus30dB,
      },
    ]);
  });

  it('analyzeMotion: ffmpeg が異常終了した場合はエラーを投げる', async () => {
    spawnMock.mockReturnValue(createFfmpegProcessMock('ffmpeg error', 2));

    const analyzer = new FfmpegVideoAnalyzer();
    await expect(analyzer.analyzeMotion('/tmp/input.mp4')).rejects.toThrow(
      'FFmpeg の解析に失敗しました: exit code 2, stderr: ffmpeg error'
    );
  });
});
