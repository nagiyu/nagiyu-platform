import { MotionHighlightService } from '../../../src/libs/motion-highlight.service.js';
import type {
  FfmpegVideoAnalyzer,
  TimeWindowScore,
} from '../../../src/libs/ffmpeg-video-analyzer.js';

const createAnalyzerMock = (): jest.Mocked<FfmpegVideoAnalyzer> =>
  ({
    analyzeMotion: jest.fn(),
    analyzeVolume: jest.fn(),
    getDurationSec: jest.fn(),
    ensureMinimumDuration: jest.fn(),
  }) as unknown as jest.Mocked<FfmpegVideoAnalyzer>;

describe('MotionHighlightService', () => {
  it('analyzer の結果を motion source の highlights に変換する', async () => {
    const analyzer = createAnalyzerMock();
    analyzer.getDurationSec.mockResolvedValue(100);
    analyzer.analyzeMotion.mockResolvedValue([
      { startSec: 5.1, endSec: 12.2, score: 9 },
    ] as TimeWindowScore[]);
    analyzer.ensureMinimumDuration.mockReturnValue({ startSec: 5, endSec: 13 });

    const service = new MotionHighlightService(analyzer);
    const result = await service.extractHighlights('job-1', '/tmp/input.mp4');

    expect(result).toEqual([
      {
        startSec: 5,
        endSec: 13,
        score: 9,
        source: 'motion',
      },
    ]);
    expect(analyzer.getDurationSec).toHaveBeenCalledWith('/tmp/input.mp4');
    expect(analyzer.analyzeMotion).toHaveBeenCalledWith('/tmp/input.mp4', 10);
    expect(analyzer.ensureMinimumDuration).toHaveBeenCalledWith(5, 13);
  });
});
