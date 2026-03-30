import { FfmpegVideoAnalyzer } from '../../../src/libs/ffmpeg-video-analyzer.js';
import { EventEmitter } from 'node:events';

const spawnMock = jest.fn();

jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const createFfmpegProcessMock = (stderrOutput: string, code = 0): EventEmitter & { stderr: EventEmitter } => {
  const process = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  process.stderr = new EventEmitter();
  globalThis.process.nextTick(() => {
    process.stderr.emit('data', Buffer.from(stderrOutput));
    process.emit('close', code);
  });
  return process;
};

describe('FfmpegVideoAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ensureMinimumDuration: 3秒未満の区間を3秒に補正する', () => {
    const analyzer = new FfmpegVideoAnalyzer();
    expect(analyzer.ensureMinimumDuration(10, 11)).toEqual({ startSec: 10, endSec: 13 });
  });

  it('ensureMinimumDuration: 3秒以上の区間はそのまま返す', () => {
    const analyzer = new FfmpegVideoAnalyzer();
    expect(analyzer.ensureMinimumDuration(10, 15)).toEqual({ startSec: 10, endSec: 15 });
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
    const result = await analyzer.analyzeMotion('/tmp/input.mp4', 10);

    expect(result).toEqual([
      { startSec: 10, endSec: 20, score: 0.44 },
      { startSec: 20, endSec: 30, score: 0.3 },
    ]);
  });

  it('analyzeVolume: metadata が改行される形式でも RMS_level を抽出できる', async () => {
    spawnMock
      .mockReturnValueOnce(
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
    const result = await analyzer.analyzeVolume('/tmp/input.mp4', 10);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ startSec: 10, endSec: 20 });
    expect(result[1]).toMatchObject({ startSec: 20, endSec: 30 });
    expect(result[0]!.score).toBeCloseTo(0.1, 6);
    expect(result[1]!.score).toBeCloseTo(0.0316227, 6);
  });
});
