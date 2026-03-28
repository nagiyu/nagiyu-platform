import type { ExtractedHighlight, HighlightExtractorService } from '@nagiyu/quick-clip-core';
import { FfmpegVideoAnalyzer } from './ffmpeg-video-analyzer.js';

const DEFAULT_LIMIT = 10;

export class VolumeHighlightService implements HighlightExtractorService {
  private readonly analyzer: FfmpegVideoAnalyzer;

  constructor(analyzer: FfmpegVideoAnalyzer) {
    this.analyzer = analyzer;
  }

  public async extractHighlights(
    _jobId: string,
    videoFilePath: string
  ): Promise<ExtractedHighlight[]> {
    const duration = await this.analyzer.getDurationSec(videoFilePath);
    const volumeScores = await this.analyzer.analyzeVolume(videoFilePath, DEFAULT_LIMIT);

    return volumeScores.map((window) => {
      const normalizedStart = Math.max(0, Math.floor(window.startSec));
      const rawEnd = Math.min(duration, Math.ceil(window.endSec));
      const adjusted = this.analyzer.ensureMinimumDuration(normalizedStart, rawEnd);
      return {
        startSec: adjusted.startSec,
        endSec: Math.min(duration, adjusted.endSec),
        score: window.score,
        source: 'volume',
      };
    });
  }
}
