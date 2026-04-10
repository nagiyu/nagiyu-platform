import { spawn } from 'node:child_process';
import type { HighlightScore } from './highlight-extractor.service.js';

const ERROR_MESSAGES = {
  FFMPEG_FAILED: 'FFmpeg の解析に失敗しました',
} as const;

export type UniformInterval = {
  start: number;
  end: number;
};

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

const parseUniformIntervals = (stderr: string): UniformInterval[] => {
  const intervals: UniformInterval[] = [];
  for (const line of stderr.split(/\r?\n/)) {
    const startMatch = line.match(/black_start:([\d.]+)/);
    const endMatch = line.match(/black_end:([\d.]+)/);
    if (startMatch && endMatch) {
      const start = Number.parseFloat(startMatch[1] ?? '');
      const end = Number.parseFloat(endMatch[1] ?? '');
      if (Number.isFinite(start) && Number.isFinite(end)) {
        intervals.push({ start, end });
      }
    }
  }
  return intervals;
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

export class FfmpegVideoAnalyzer {
  public async analyzeMotion(videoFilePath: string): Promise<HighlightScore[]> {
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

    const sceneEntries: HighlightScore[] = [];
    let currentPtsTime: number | null = null;
    for (const line of stderr.split(/\r?\n/)) {
      const ptsMatch = line.match(/pts_time:([\d.]+)/);
      if (ptsMatch) {
        const parsedPtsTime = Number.parseFloat(ptsMatch[1] ?? '');
        if (Number.isFinite(parsedPtsTime)) {
          currentPtsTime = parsedPtsTime;
        }
      }
      const scoreMatch = line.match(/(?:lavfi\.)?scene_score=([-\d.]+)/);
      if (scoreMatch && currentPtsTime !== null) {
        const parsedScore = Number.parseFloat(scoreMatch[1] ?? '');
        if (!Number.isFinite(parsedScore)) {
          continue;
        }
        sceneEntries.push({
          second: currentPtsTime,
          score: parsedScore,
        });
      }
    }

    return sceneEntries;
  }

  public async analyzeVolume(videoFilePath: string): Promise<HighlightScore[]> {
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

    const entries: HighlightScore[] = [];
    let currentFrame: number | null = null;
    let currentPtsTime: number | null = null;
    for (const line of stderr.split(/\r?\n/)) {
      const frameMatch = line.match(/frame:(\d+)/);
      if (frameMatch) {
        const parsedFrame = Number.parseInt(frameMatch[1] ?? '', 10);
        if (Number.isFinite(parsedFrame)) {
          currentFrame = parsedFrame;
        }
      }

      const ptsTimeMatch = line.match(/pts_time:([\d.]+)/);
      if (ptsTimeMatch) {
        const parsedPtsTime = Number.parseFloat(ptsTimeMatch[1] ?? '');
        if (Number.isFinite(parsedPtsTime)) {
          currentPtsTime = parsedPtsTime;
        }
      }

      const rmsLevelMatch = line.match(/(?:lavfi\.astats\.Overall\.)?RMS_level=([-\d.]+)/);
      if (rmsLevelMatch) {
        const rmsLevel = Number.parseFloat(rmsLevelMatch[1] ?? '');
        if (!Number.isFinite(rmsLevel)) {
          continue;
        }
        const secondFromPts = currentPtsTime !== null ? currentPtsTime : Number.NaN;
        const secondFromFrame = currentFrame !== null && fps > 0 ? currentFrame / fps : Number.NaN;
        const second = Number.isFinite(secondFromPts) ? secondFromPts : secondFromFrame;
        const amplitude = Number.isFinite(rmsLevel) ? Math.pow(10, rmsLevel / 20) : 0;
        if (!Number.isFinite(second) || second < 0 || amplitude <= 0) {
          continue;
        }
        entries.push({
          second,
          score: amplitude,
        });
      }
    }
    return entries;
  }

  public async getDurationSec(videoFilePath: string): Promise<number> {
    const stderr = await this.runFfmpeg(['-hide_banner', '-i', videoFilePath]);
    const durationMatch = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/);
    const duration = parseTimeToSeconds(durationMatch?.[1] ?? '');
    return Number.isFinite(duration) && duration > 0 ? duration : 10;
  }

  public async detectUniformIntervals(videoFilePath: string): Promise<UniformInterval[]> {
    const [darkStderr, brightStderr] = await Promise.all([
      this.runFfmpeg([
        '-hide_banner',
        '-i',
        videoFilePath,
        '-vf',
        'blackdetect=d=0:pix_th=0.10',
        '-an',
        '-f',
        'null',
        '-',
      ]),
      this.runFfmpeg([
        '-hide_banner',
        '-i',
        videoFilePath,
        '-vf',
        'negate,blackdetect=d=0:pix_th=0.10',
        '-an',
        '-f',
        'null',
        '-',
      ]),
    ]);
    return parseUniformIntervals(darkStderr + '\n' + brightStderr);
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
