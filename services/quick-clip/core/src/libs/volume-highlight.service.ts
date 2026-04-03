import type { HighlightScore } from './highlight-extractor.service.js';
import { FfmpegVideoAnalyzer } from './ffmpeg-video-analyzer.js';

export class VolumeHighlightService {
  private readonly analyzer: FfmpegVideoAnalyzer;

  constructor(analyzer: FfmpegVideoAnalyzer) {
    this.analyzer = analyzer;
  }

  public async analyzeVolume(videoFilePath: string): Promise<HighlightScore[]> {
    return this.analyzer.analyzeVolume(videoFilePath);
  }
}
