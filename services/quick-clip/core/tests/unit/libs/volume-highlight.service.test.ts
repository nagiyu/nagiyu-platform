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
    const result = await service.analyzeVolume('/tmp/input.mp4');

    expect(result).toEqual([{ second: 20.4, score: 1.25 }]);
    expect(analyzer.analyzeVolume).toHaveBeenCalledWith('/tmp/input.mp4');
  });
});
