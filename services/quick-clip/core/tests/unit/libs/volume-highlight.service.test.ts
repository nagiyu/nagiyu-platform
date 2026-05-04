import { VolumeHighlightService } from '../../../src/libs/volume-highlight.service.js';
import type { FfmpegVideoAnalyzer } from '../../../src/libs/ffmpeg-video-analyzer.js';

const createAnalyzerMock = (): jest.Mocked<FfmpegVideoAnalyzer> =>
  ({
    analyzeMotion: jest.fn(),
    analyzeVolume: jest.fn(),
    getDurationSec: jest.fn(),
  }) as unknown as jest.Mocked<FfmpegVideoAnalyzer>;

describe('VolumeHighlightService', () => {
  it('analyzer から返る生スコアをそのまま返す', async () => {
    const analyzer = createAnalyzerMock();
    analyzer.analyzeVolume.mockResolvedValue([{ second: 20.4, score: 1.25 }]);

    const service = new VolumeHighlightService(analyzer);
    const result = await service.analyzeVolume('/tmp/input.mp4', 600);

    expect(result).toEqual([{ second: 20.4, score: 1.25 }]);
    expect(analyzer.analyzeVolume).toHaveBeenCalledWith('/tmp/input.mp4', 0, 600);
  });

  it('analyzeVolume: videoDurationSec に応じてチャンク数が計算される（600秒 → 1チャンク）', async () => {
    const analyzer = createAnalyzerMock();
    analyzer.analyzeVolume.mockResolvedValue([]);

    const service = new VolumeHighlightService(analyzer);
    await service.analyzeVolume('/tmp/input.mp4', 600);

    expect(analyzer.analyzeVolume).toHaveBeenCalledTimes(1);
    expect(analyzer.analyzeVolume).toHaveBeenCalledWith('/tmp/input.mp4', 0, 600);
  });

  it('analyzeVolume: videoDurationSec に応じてチャンク数が計算される（1200秒 → 2チャンク）', async () => {
    const analyzer = createAnalyzerMock();
    analyzer.analyzeVolume.mockResolvedValue([]);

    const service = new VolumeHighlightService(analyzer);
    await service.analyzeVolume('/tmp/input.mp4', 1200);

    expect(analyzer.analyzeVolume).toHaveBeenCalledTimes(2);
    expect(analyzer.analyzeVolume).toHaveBeenCalledWith('/tmp/input.mp4', 0, 600);
    expect(analyzer.analyzeVolume).toHaveBeenCalledWith('/tmp/input.mp4', 600, 600);
  });

  it('analyzeVolume: videoDurationSec に応じてチャンク数が計算される（601秒 → 2チャンク）', async () => {
    const analyzer = createAnalyzerMock();
    analyzer.analyzeVolume.mockResolvedValue([]);

    const service = new VolumeHighlightService(analyzer);
    await service.analyzeVolume('/tmp/input.mp4', 601);

    expect(analyzer.analyzeVolume).toHaveBeenCalledTimes(2);
    expect(analyzer.analyzeVolume).toHaveBeenCalledWith('/tmp/input.mp4', 0, 600);
    expect(analyzer.analyzeVolume).toHaveBeenCalledWith('/tmp/input.mp4', 600, 600);
  });

  it('analyzeVolume: 複数チャンクの結果が flat() でマージされる', async () => {
    const analyzer = createAnalyzerMock();
    analyzer.analyzeVolume
      .mockResolvedValueOnce([{ second: 10.0, score: 0.5 }])
      .mockResolvedValueOnce([{ second: 700.0, score: 0.8 }]);

    const service = new VolumeHighlightService(analyzer);
    const result = await service.analyzeVolume('/tmp/input.mp4', 1200);

    expect(result).toEqual([
      { second: 10.0, score: 0.5 },
      { second: 700.0, score: 0.8 },
    ]);
  });

  it('analyzeVolume: concurrency は最大 4 を超えない（24チャンクの場合）', async () => {
    const analyzer = createAnalyzerMock();
    let concurrentCount = 0;
    let maxConcurrent = 0;

    analyzer.analyzeVolume.mockImplementation(async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((resolve) => setImmediate(resolve));
      concurrentCount--;
      return [];
    });

    const service = new VolumeHighlightService(analyzer);
    await service.analyzeVolume('/tmp/input.mp4', 14400); // 24 chunks

    expect(maxConcurrent).toBeLessThanOrEqual(4);
  });
});
