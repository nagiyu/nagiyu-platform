import { MotionHighlightService } from '../../../src/libs/motion-highlight.service.js';
import type { FfmpegVideoAnalyzer } from '../../../src/libs/ffmpeg-video-analyzer.js';

const createAnalyzerMock = (): jest.Mocked<FfmpegVideoAnalyzer> =>
  ({
    analyzeMotion: jest.fn(),
    analyzeVolume: jest.fn(),
    getDurationSec: jest.fn(),
  }) as unknown as jest.Mocked<FfmpegVideoAnalyzer>;

describe('MotionHighlightService', () => {
  it('analyzer から返る生スコアをそのまま返す', async () => {
    const analyzer = createAnalyzerMock();
    analyzer.analyzeMotion.mockResolvedValue([{ second: 5.1, score: 9 }]);

    const service = new MotionHighlightService(analyzer);
    const result = await service.analyzeMotion('/tmp/input.mp4');

    expect(result).toEqual([{ second: 5.1, score: 9 }]);
    expect(analyzer.analyzeMotion).toHaveBeenCalledWith('/tmp/input.mp4');
  });
});
