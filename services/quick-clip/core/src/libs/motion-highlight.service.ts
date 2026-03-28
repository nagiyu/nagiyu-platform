import type {
  ExtractedHighlight,
  HighlightExtractorService,
} from './highlight-extractor.service.js';
import { FfmpegVideoAnalyzer } from './ffmpeg-video-analyzer.js';

const DEFAULT_LIMIT = 10;

export class MotionHighlightService implements HighlightExtractorService {
  private readonly analyzer: FfmpegVideoAnalyzer;

  constructor(analyzer: FfmpegVideoAnalyzer) {
    this.analyzer = analyzer;
  }

  public async extractHighlights(
    _jobId: string,
    videoFilePath: string
  ): Promise<ExtractedHighlight[]> {
    const duration = await this.analyzer.getDurationSec(videoFilePath);
    const motionScores = await this.analyzer.analyzeMotion(videoFilePath, DEFAULT_LIMIT);

    return motionScores.map((window) => {
      const normalizedStart = Math.max(0, Math.floor(window.startSec));
      const rawEnd = Math.min(duration, Math.ceil(window.endSec));
      const adjusted = this.analyzer.ensureMinimumDuration(normalizedStart, rawEnd);
      return {
        startSec: adjusted.startSec,
        endSec: Math.min(duration, adjusted.endSec),
        score: window.score,
        source: 'motion',
      };
    });
  }
}
