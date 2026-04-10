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

    const result = await service.analyzeMotion('/tmp/input.mp4');

    expect(result).toEqual([{ second: 5.1, score: 9 }]);
    expect(analyzer.analyzeMotion).toHaveBeenCalledWith('/tmp/input.mp4');
  });

  it('analyzeMotion: 均一区間内のスコアは除外される', async () => {
    analyzer.analyzeMotion.mockResolvedValue([
      { second: 5.5, score: 0.9 },
      { second: 20.0, score: 0.5 },
    ]);
    analyzer.detectUniformIntervals.mockResolvedValue([{ start: 5.0, end: 6.5 }]);

    const result = await service.analyzeMotion('/tmp/input.mp4');

    expect(result).toEqual([{ second: 20.0, score: 0.5 }]);
  });

  it('analyzeMotion: 均一区間がない場合はすべてのスコアをそのまま返す', async () => {
    analyzer.analyzeMotion.mockResolvedValue([
      { second: 1.0, score: 0.3 },
      { second: 2.0, score: 0.7 },
    ]);
    analyzer.detectUniformIntervals.mockResolvedValue([]);

    const result = await service.analyzeMotion('/tmp/input.mp4');

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

    const result = await service.analyzeMotion('/tmp/input.mp4');

    expect(result).toEqual([{ second: 7.0, score: 0.4 }]);
  });
});
