import type {
  HighlightScore,
} from './highlight-extractor.service.js';
import { FfmpegVideoAnalyzer } from './ffmpeg-video-analyzer.js';

export class MotionHighlightService {
  private readonly analyzer: FfmpegVideoAnalyzer;

  constructor(analyzer: FfmpegVideoAnalyzer) {
    this.analyzer = analyzer;
  }

  public async analyzeMotion(videoFilePath: string): Promise<HighlightScore[]> {
    return this.analyzer.analyzeMotion(videoFilePath);
  }
}
