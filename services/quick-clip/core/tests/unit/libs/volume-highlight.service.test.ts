import { VolumeHighlightService } from '../../../src/libs/volume-highlight.service.js';
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

describe('VolumeHighlightService', () => {
  it('analyzer の結果を volume source の highlights に変換する', async () => {
    const analyzer = createAnalyzerMock();
    analyzer.getDurationSec.mockResolvedValue(80);
    analyzer.analyzeVolume.mockResolvedValue([
      { startSec: 20.4, endSec: 28.8, score: 1.25 },
    ] as TimeWindowScore[]);
    analyzer.ensureMinimumDuration.mockReturnValue({ startSec: 20, endSec: 29 });

    const service = new VolumeHighlightService(analyzer);
    const result = await service.extractHighlights('job-1', '/tmp/input.mp4');

    expect(result).toEqual([
      {
        startSec: 20,
        endSec: 29,
        score: 1.25,
        source: 'volume',
      },
    ]);
    expect(analyzer.getDurationSec).toHaveBeenCalledWith('/tmp/input.mp4');
    expect(analyzer.analyzeVolume).toHaveBeenCalledWith('/tmp/input.mp4', 10);
    expect(analyzer.ensureMinimumDuration).toHaveBeenCalledWith(20, 29);
  });
});
