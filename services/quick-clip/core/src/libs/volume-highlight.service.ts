import type { HighlightScore } from './highlight-extractor.service.js';
import { FfmpegVideoAnalyzer } from './ffmpeg-video-analyzer.js';

const ANALYSIS_CHUNK_DURATION_SEC = 10 * 60;
const VOLUME_ANALYSIS_CONCURRENCY = 4;

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]!();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

export class VolumeHighlightService {
  private readonly analyzer: FfmpegVideoAnalyzer;

  constructor(analyzer: FfmpegVideoAnalyzer) {
    this.analyzer = analyzer;
  }

  public async analyzeVolume(
    videoFilePath: string,
    videoDurationSec: number
  ): Promise<HighlightScore[]> {
    const numChunks = Math.ceil(videoDurationSec / ANALYSIS_CHUNK_DURATION_SEC);

    const chunkScores = await runWithConcurrency(
      Array.from({ length: numChunks }, (_, i) => async () => {
        const startSec = i * ANALYSIS_CHUNK_DURATION_SEC;
        return this.analyzer.analyzeVolume(videoFilePath, startSec, ANALYSIS_CHUNK_DURATION_SEC);
      }),
      VOLUME_ANALYSIS_CONCURRENCY
    );

    return chunkScores.flat();
  }
}
