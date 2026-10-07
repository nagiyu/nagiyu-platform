import { runWithConcurrency } from '@nagiyu/common';
import type { HighlightScore } from './highlight-extractor.service.js';
import { FfmpegVideoAnalyzer } from './ffmpeg-video-analyzer.js';

const ANALYSIS_CHUNK_DURATION_SEC = 10 * 60;
const MOTION_ANALYSIS_CONCURRENCY = 4;

export class MotionHighlightService {
  private readonly analyzer: FfmpegVideoAnalyzer;

  constructor(analyzer: FfmpegVideoAnalyzer) {
    this.analyzer = analyzer;
  }

  public async analyzeMotion(
    videoFilePath: string,
    videoDurationSec: number
  ): Promise<HighlightScore[]> {
    const numChunks = Math.ceil(videoDurationSec / ANALYSIS_CHUNK_DURATION_SEC);

    const [uniformIntervals, chunkScores] = await Promise.all([
      this.analyzer.detectUniformIntervals(videoFilePath),
      runWithConcurrency(
        Array.from({ length: numChunks }, (_, i) => async () => {
          const startSec = i * ANALYSIS_CHUNK_DURATION_SEC;
          return this.analyzer.analyzeMotion(videoFilePath, startSec, ANALYSIS_CHUNK_DURATION_SEC);
        }),
        MOTION_ANALYSIS_CONCURRENCY
      ),
    ]);

    const scores = chunkScores.flat();

    if (uniformIntervals.length === 0) return scores;
    return scores.filter(
      ({ second }) => !uniformIntervals.some(({ start, end }) => second >= start && second <= end)
    );
  }
}
