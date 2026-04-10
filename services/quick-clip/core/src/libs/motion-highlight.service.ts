import type { HighlightScore } from './highlight-extractor.service.js';
import { FfmpegVideoAnalyzer } from './ffmpeg-video-analyzer.js';

export class MotionHighlightService {
  private readonly analyzer: FfmpegVideoAnalyzer;

  constructor(analyzer: FfmpegVideoAnalyzer) {
    this.analyzer = analyzer;
  }

  public async analyzeMotion(videoFilePath: string): Promise<HighlightScore[]> {
    const [scores, uniformIntervals] = await Promise.all([
      this.analyzer.analyzeMotion(videoFilePath),
      this.analyzer.detectUniformIntervals(videoFilePath),
    ]);
    if (uniformIntervals.length === 0) {
      return scores;
    }
    return scores.filter(
      ({ second }) =>
        !uniformIntervals.some(({ start, end }) => second >= start && second <= end),
    );
  }
}
