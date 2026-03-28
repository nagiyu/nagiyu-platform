import { spawn } from 'node:child_process';
import type { ClipSplitterService, Highlight } from '@nagiyu/quick-clip-core';

const ERROR_MESSAGES = {
  SPLIT_FAILED: 'クリップ分割に失敗しました',
} as const;

const CLIPS_DIR = '/tmp';

export class FfmpegClipSplitter implements ClipSplitterService {
  public async splitClips(
    jobId: string,
    videoFilePath: string,
    highlights: Highlight[]
  ): Promise<string[]> {
    const accepted = highlights
      .filter((highlight) => highlight.status === 'accepted')
      .sort((a, b) => a.order - b.order);

    const outputPaths: string[] = [];
    for (const highlight of accepted) {
      const duration = Math.max(0, highlight.endSec - highlight.startSec);
      const outputPath = `${CLIPS_DIR}/${jobId}-${highlight.highlightId}.mp4`;

      await this.runFfmpeg([
        '-hide_banner',
        '-ss',
        String(highlight.startSec),
        '-t',
        String(duration),
        '-i',
        videoFilePath,
        '-c',
        'copy',
        '-y',
        outputPath,
      ]);
      outputPaths.push(outputPath);
    }

    return outputPaths;
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);
      let stderr = '';
      ffmpeg.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      ffmpeg.on('error', (error) => {
        reject(new Error(`${ERROR_MESSAGES.SPLIT_FAILED}: ${error.message}`));
      });
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`${ERROR_MESSAGES.SPLIT_FAILED}: exit code ${code}, stderr: ${stderr}`));
      });
    });
  }
}
