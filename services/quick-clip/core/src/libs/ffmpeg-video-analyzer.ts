import { spawn } from 'node:child_process';

export type TimeWindowScore = {
  startSec: number;
  endSec: number;
  score: number;
};

const ERROR_MESSAGES = {
  FFMPEG_FAILED: 'FFmpeg の解析に失敗しました',
} as const;

const DEFAULT_WINDOW_SECONDS = 10;
const MIN_HIGHLIGHT_WINDOW_SECONDS = 3;
const DURATION_PROBE_ARGS_LENGTH = 3;

const parseFps = (input: string): number => {
  const direct = Number.parseFloat(input);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  const [numerator, denominator] = input.split('/');
  const n = Number.parseFloat(numerator ?? '');
  const d = Number.parseFloat(denominator ?? '');
  if (Number.isFinite(n) && Number.isFinite(d) && d > 0) {
    return n / d;
  }

  return 0;
};

const parseTimeToSeconds = (value: string): number => {
  const parts = value.split(':');
  if (parts.length !== 3) {
    return Number.NaN;
  }
  const hours = Number.parseFloat(parts[0] ?? '');
  const minutes = Number.parseFloat(parts[1] ?? '');
  const seconds = Number.parseFloat(parts[2] ?? '');
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return Number.NaN;
  }
  return hours * 3600 + minutes * 60 + seconds;
};

const toTopWindows = (
  entries: Array<{ second: number; score: number }>,
  limit: number
): TimeWindowScore[] => {
  const merged = new Map<number, number>();
  for (const entry of entries) {
    const secondKey = Math.floor(entry.second / DEFAULT_WINDOW_SECONDS) * DEFAULT_WINDOW_SECONDS;
    const current = merged.get(secondKey) ?? 0;
    merged.set(secondKey, current + entry.score);
  }

  return Array.from(merged.entries())
    .map(([startSec, score]) => ({
      startSec,
      endSec: startSec + DEFAULT_WINDOW_SECONDS,
      score,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.startSec - b.startSec;
    })
    .slice(0, limit);
};

export class FfmpegVideoAnalyzer {
  public async analyzeMotion(videoFilePath: string, limit = 10): Promise<TimeWindowScore[]> {
    const stderr = await this.runFfmpeg([
      '-hide_banner',
      '-i',
      videoFilePath,
      '-vf',
      'select=gt(scene\\,0.2),metadata=print',
      '-an',
      '-f',
      'null',
      '-',
    ]);

    const sceneEntries = Array.from(
      stderr.matchAll(/pts_time:([\d.]+)[\s\S]*?(?:lavfi\.)?scene_score=([-\d.]+)/g),
      (match) => ({
        second: Number.parseFloat(match[1] ?? ''),
        score: Number.parseFloat(match[2] ?? ''),
      })
    ).filter(
      (entry) =>
        Number.isFinite(entry.second) &&
        entry.second >= 0 &&
        Number.isFinite(entry.score) &&
        entry.score > 0
    );

    return toTopWindows(sceneEntries, limit);
  }

  public async analyzeVolume(videoFilePath: string, limit = 10): Promise<TimeWindowScore[]> {
    const stderr = await this.runFfmpeg([
      '-hide_banner',
      '-i',
      videoFilePath,
      '-vn',
      '-af',
      'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
      '-f',
      'null',
      '-',
    ]);

    const fpsMatch = stderr.match(/([\d./]+)\s+fps/);
    const fps = parseFps(fpsMatch?.[1] ?? '');

    const entries = Array.from(
      stderr.matchAll(
        /frame:(\d+)[\s\S]*?pts_time:([\d.]+)[\s\S]*?(?:lavfi\.astats\.Overall\.)?RMS_level=([-\d.]+)/g
      ),
      (match) => {
        const frame = Number.parseInt(match[1] ?? '', 10);
        const ptsTime = Number.parseFloat(match[2] ?? '');
        const rmsLevel = Number.parseFloat(match[3] ?? '');

        const secondFromPts = Number.isFinite(ptsTime) ? ptsTime : Number.NaN;
        const secondFromFrame = Number.isFinite(frame) && fps > 0 ? frame / fps : Number.NaN;
        const second = Number.isFinite(secondFromPts) ? secondFromPts : secondFromFrame;
        const amplitude = Number.isFinite(rmsLevel) ? Math.pow(10, rmsLevel / 20) : 0;

        return {
          second,
          score: amplitude,
        };
      }
    ).filter((entry) => Number.isFinite(entry.second) && entry.second >= 0 && entry.score > 0);

    return toTopWindows(entries, limit);
  }

  public async getDurationSec(videoFilePath: string): Promise<number> {
    const stderr = await this.runFfmpeg(['-hide_banner', '-i', videoFilePath]);
    const durationMatch = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/);
    const duration = parseTimeToSeconds(durationMatch?.[1] ?? '');
    return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_WINDOW_SECONDS;
  }

  public ensureMinimumDuration(
    startSec: number,
    endSec: number
  ): { startSec: number; endSec: number } {
    if (endSec - startSec >= MIN_HIGHLIGHT_WINDOW_SECONDS) {
      return { startSec, endSec };
    }

    return {
      startSec,
      endSec: startSec + MIN_HIGHLIGHT_WINDOW_SECONDS,
    };
  }

  private runFfmpeg(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);
      let stderr = '';

      ffmpeg.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`${ERROR_MESSAGES.FFMPEG_FAILED}: ${error.message}`));
      });

      ffmpeg.on('close', (code) => {
        // `ffmpeg -hide_banner -i <file>` は情報表示のみのため code=1 で終了する。
        if (code === 0 || (args.length === DURATION_PROBE_ARGS_LENGTH && code === 1)) {
          resolve(stderr);
          return;
        }

        reject(new Error(`${ERROR_MESSAGES.FFMPEG_FAILED}: exit code ${code}, stderr: ${stderr}`));
      });
    });
  }
}
