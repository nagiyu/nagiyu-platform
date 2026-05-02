import { MotionHighlightService } from '../../../src/libs/motion-highlight.service.js';
import type { FfmpegVideoAnalyzer } from '../../../src/libs/ffmpeg-video-analyzer.js';

const createAnalyzerMock = (): jest.Mocked<FfmpegVideoAnalyzer> =>
  ({
    analyzeMotion: jest.fn(),
    analyzeVolume: jest.fn(),
    getDurationSec: jest.fn(),
    detectUniformIntervals: jest.fn(),
  }) as unknown as jest.Mocked<FfmpegVideoAnalyzer>;

describe('MotionHighlightService', () => {
  let analyzer: jest.Mocked<FfmpegVideoAnalyzer>;
  let service: MotionHighlightService;

  beforeEach(() => {
    analyzer = createAnalyzerMock();
    service = new MotionHighlightService(analyzer);
  });

  it('analyzer から返る生スコアをそのまま返す（均一区間なし）', async () => {
    analyzer.analyzeMotion.mockResolvedValue([{ second: 5.1, score: 9 }]);
    analyzer.detectUniformIntervals.mockResolvedValue([]);

    const result = await service.analyzeMotion('/tmp/input.mp4', 600);

    expect(result).toEqual([{ second: 5.1, score: 9 }]);
  });

  it('analyzeMotion: 均一区間内のスコアは除外される', async () => {
    analyzer.analyzeMotion.mockResolvedValue([
      { second: 5.5, score: 0.9 },
      { second: 20.0, score: 0.5 },
    ]);
    analyzer.detectUniformIntervals.mockResolvedValue([{ start: 5.0, end: 6.5 }]);

    const result = await service.analyzeMotion('/tmp/input.mp4', 600);

    expect(result).toEqual([{ second: 20.0, score: 0.5 }]);
  });

  it('analyzeMotion: 均一区間がない場合はすべてのスコアをそのまま返す', async () => {
    analyzer.analyzeMotion.mockResolvedValue([
      { second: 1.0, score: 0.3 },
      { second: 2.0, score: 0.7 },
    ]);
    analyzer.detectUniformIntervals.mockResolvedValue([]);

    const result = await service.analyzeMotion('/tmp/input.mp4', 600);

    expect(result).toEqual([
      { second: 1.0, score: 0.3 },
      { second: 2.0, score: 0.7 },
    ]);
  });

  it('analyzeMotion: 均一区間の境界値（start/end と一致する秒数）は除外される', async () => {
    analyzer.analyzeMotion.mockResolvedValue([
      { second: 5.0, score: 0.8 },
      { second: 6.5, score: 0.6 },
      { second: 7.0, score: 0.4 },
    ]);
    analyzer.detectUniformIntervals.mockResolvedValue([{ start: 5.0, end: 6.5 }]);

    const result = await service.analyzeMotion('/tmp/input.mp4', 600);

    expect(result).toEqual([{ second: 7.0, score: 0.4 }]);
  });

  it('analyzeMotion: videoDurationSec に応じてチャンク数が計算される（600秒 → 1チャンク）', async () => {
    analyzer.analyzeMotion.mockResolvedValue([]);
    analyzer.detectUniformIntervals.mockResolvedValue([]);

    await service.analyzeMotion('/tmp/input.mp4', 600);

    expect(analyzer.analyzeMotion).toHaveBeenCalledTimes(1);
    expect(analyzer.analyzeMotion).toHaveBeenCalledWith('/tmp/input.mp4', 0, 600);
  });

  it('analyzeMotion: videoDurationSec に応じてチャンク数が計算される（1200秒 → 2チャンク）', async () => {
    analyzer.analyzeMotion.mockResolvedValue([]);
    analyzer.detectUniformIntervals.mockResolvedValue([]);

    await service.analyzeMotion('/tmp/input.mp4', 1200);

    expect(analyzer.analyzeMotion).toHaveBeenCalledTimes(2);
    expect(analyzer.analyzeMotion).toHaveBeenCalledWith('/tmp/input.mp4', 0, 600);
    expect(analyzer.analyzeMotion).toHaveBeenCalledWith('/tmp/input.mp4', 600, 600);
  });

  it('analyzeMotion: videoDurationSec に応じてチャンク数が計算される（601秒 → 2チャンク）', async () => {
    analyzer.analyzeMotion.mockResolvedValue([]);
    analyzer.detectUniformIntervals.mockResolvedValue([]);

    await service.analyzeMotion('/tmp/input.mp4', 601);

    expect(analyzer.analyzeMotion).toHaveBeenCalledTimes(2);
    expect(analyzer.analyzeMotion).toHaveBeenCalledWith('/tmp/input.mp4', 0, 600);
    expect(analyzer.analyzeMotion).toHaveBeenCalledWith('/tmp/input.mp4', 600, 600);
  });

  it('analyzeMotion: 複数チャンクの結果が flat() でマージされる', async () => {
    analyzer.analyzeMotion
      .mockResolvedValueOnce([{ second: 10.0, score: 0.5 }])
      .mockResolvedValueOnce([{ second: 700.0, score: 0.8 }]);
    analyzer.detectUniformIntervals.mockResolvedValue([]);

    const result = await service.analyzeMotion('/tmp/input.mp4', 1200);

    expect(result).toEqual([
      { second: 10.0, score: 0.5 },
      { second: 700.0, score: 0.8 },
    ]);
  });

  it('analyzeMotion: detectUniformIntervals はフル動画1回だけ呼ばれる（複数チャンクの場合）', async () => {
    analyzer.analyzeMotion.mockResolvedValue([]);
    analyzer.detectUniformIntervals.mockResolvedValue([]);

    await service.analyzeMotion('/tmp/input.mp4', 2400);

    expect(analyzer.detectUniformIntervals).toHaveBeenCalledTimes(1);
    expect(analyzer.detectUniformIntervals).toHaveBeenCalledWith('/tmp/input.mp4');
  });

  it('analyzeMotion: concurrency は最大 4 を超えない（24チャンクの場合）', async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    analyzer.analyzeMotion.mockImplementation(async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((resolve) => setImmediate(resolve));
      concurrentCount--;
      return [];
    });
    analyzer.detectUniformIntervals.mockResolvedValue([]);

    await service.analyzeMotion('/tmp/input.mp4', 14400); // 24 chunks

    expect(maxConcurrent).toBeLessThanOrEqual(4);
  });
});
