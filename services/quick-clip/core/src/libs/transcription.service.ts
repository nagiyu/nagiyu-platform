import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type OpenAI from 'openai';
import { withRetry, withTimeout } from '@nagiyu/common';

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

/** 動画先頭からの秒で表した発話の区間 */
export type SpeechRange = {
  start: number;
  end: number;
};

/** silencedetect が検出した無音の区間。末尾まで続く無音は end が undefined になる */
type SilenceRange = {
  start: number;
  end?: number;
};

const ERROR_MESSAGES = {
  AUDIO_EXTRACT_FAILED: '音声の抽出に失敗しました',
  SILENCE_DETECT_FAILED: '無音区間の検出に失敗しました',
  AUDIO_DURATION_NOT_FOUND: '音声の長さを取得できませんでした',
  TIMEOUT: '文字起こし API の呼び出しがタイムアウトしました',
} as const;

const TRANSCRIBE_MODEL = 'gpt-transcribe';
const TRANSCRIBE_LANGUAGES = ['ja'];

// 無音とみなす音量。動画の BGM や環境音を拾いすぎず、発話の間の息継ぎは無音として切れる値
const SILENCE_NOISE_DB = -35;
// 無音とみなす最短の長さ。これより短い間は文中の息継ぎとして 1 つの発話にまとめる
const SILENCE_MIN_DURATION_SEC = 0.5;
// 区間の端に足す余白。語頭・語尾が切れて認識されなくなることを防ぐ。
// 無音の最短長の半分以下にして、隣り合う区間が重ならないようにする
const SPEECH_PADDING_SEC = 0.2;
// 1 区間の最大長。後続の処理は 1 行を感情スコアの単位にするため、長すぎると 1 行が粗くなる。
// 32kbps の MP3 で約 120KB であり、API のサイズ上限に収まる
const MAX_RANGE_DURATION_SEC = 30;
// これより短い音は物音などで発話にならないため送らない
const MIN_RANGE_DURATION_SEC = 0.3;

// 長い動画では区間が数百になるため、API への同時リクエスト数を抑える
const MAX_CONCURRENCY = 5;
const MAX_RETRIES = 3;
// 1 区間は最大 MAX_RANGE_DURATION_SEC 秒の音声のため、1 回の要求は短時間で終わる
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * ffmpeg の出力から音声全体の長さ (秒) を取り出す。
 * Batch のコンテナには ffmpeg のみ入れているため、ffprobe には頼らない。
 */
export function parseDurationSec(ffmpegOutput: string): number | null {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(ffmpegOutput);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** silencedetect の出力から無音の区間を取り出す */
export function parseSilences(ffmpegOutput: string): SilenceRange[] {
  const silences: SilenceRange[] = [];
  const pattern = /silence_start:\s*(-?[\d.]+)|silence_end:\s*(-?[\d.]+)/g;
  for (const match of ffmpegOutput.matchAll(pattern)) {
    if (match[1] !== undefined) {
      silences.push({ start: Math.max(0, Number(match[1])) });
    } else if (match[2] !== undefined) {
      const last = silences[silences.length - 1];
      if (last && last.end === undefined) {
        last.end = Number(match[2]);
      }
    }
  }
  return silences;
}

/**
 * 無音の区間を除いた発話の区間を作る。
 * 長すぎる区間は均等に分割し、短すぎる区間は捨てる。
 */
export function buildSpeechRanges(silences: SilenceRange[], durationSec: number): SpeechRange[] {
  const speeches: SpeechRange[] = [];
  let cursor = 0;
  for (const silence of silences) {
    if (silence.start > cursor) {
      speeches.push({ start: cursor, end: silence.start });
    }
    if (silence.end === undefined) {
      cursor = durationSec;
      break;
    }
    cursor = Math.max(cursor, silence.end);
  }
  if (cursor < durationSec) {
    speeches.push({ start: cursor, end: durationSec });
  }

  const ranges: SpeechRange[] = [];
  for (const speech of speeches) {
    // 余白を足す前の長さで判定する。余白込みだと物音のような短い音まで送ってしまう
    if (speech.end - speech.start < MIN_RANGE_DURATION_SEC) {
      continue;
    }
    const start = Math.max(0, speech.start - SPEECH_PADDING_SEC);
    const end = Math.min(durationSec, speech.end + SPEECH_PADDING_SEC);
    const length = end - start;
    // 端数だけの短い区間ができないよう、等分して 1 区間を最大長以下にする
    const pieces = Math.max(1, Math.ceil(length / MAX_RANGE_DURATION_SEC));
    const pieceLength = length / pieces;
    for (let i = 0; i < pieces; i += 1) {
      ranges.push({ start: start + pieceLength * i, end: start + pieceLength * (i + 1) });
    }
  }
  return ranges;
}

export class TranscriptionService {
  private readonly client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  /** ffmpeg を実行し、stderr を返す */
  private runFfmpeg(args: string[], errorMessage: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';
      ffmpeg.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`${errorMessage}: ${error.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(stderr);
          return;
        }
        reject(new Error(`${errorMessage}: exit code ${code}, stderr: ${stderr}`));
      });
    });
  }

  private async extractAudio(videoFilePath: string, audioOutputPath: string): Promise<void> {
    await this.runFfmpeg(
      [
        '-hide_banner',
        '-i',
        videoFilePath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '32k',
        '-f',
        'mp3',
        '-y',
        audioOutputPath,
      ],
      ERROR_MESSAGES.AUDIO_EXTRACT_FAILED
    );
  }

  private async detectSpeechRanges(audioFilePath: string): Promise<SpeechRange[]> {
    const output = await this.runFfmpeg(
      [
        '-hide_banner',
        '-nostats',
        '-i',
        audioFilePath,
        '-vn',
        '-af',
        `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_DURATION_SEC}`,
        '-f',
        'null',
        '-',
      ],
      ERROR_MESSAGES.SILENCE_DETECT_FAILED
    );
    const durationSec = parseDurationSec(output);
    if (durationSec === null) {
      throw new Error(`${ERROR_MESSAGES.AUDIO_DURATION_NOT_FOUND}: stderr: ${output}`);
    }
    return buildSpeechRanges(parseSilences(output), durationSec);
  }

  private async extractAudioRange(
    audioFilePath: string,
    outputPath: string,
    range: SpeechRange
  ): Promise<void> {
    await this.runFfmpeg(
      [
        '-hide_banner',
        '-ss',
        range.start.toFixed(3),
        '-i',
        audioFilePath,
        '-t',
        (range.end - range.start).toFixed(3),
        '-c:a',
        'copy',
        '-y',
        outputPath,
      ],
      ERROR_MESSAGES.AUDIO_EXTRACT_FAILED
    );
  }

  private async transcribeFile(audioFilePath: string, signal: AbortSignal): Promise<string> {
    const response = await this.client.audio.transcriptions.create(
      {
        model: TRANSCRIBE_MODEL,
        file: createReadStream(audioFilePath),
        languages: TRANSCRIBE_LANGUAGES,
      },
      { signal }
    );
    return response.text.trim();
  }

  private async transcribeRange(
    audioFilePath: string,
    range: SpeechRange
  ): Promise<TranscriptSegment | null> {
    const rangePath = join(dirname(audioFilePath), `quick-clip-audio-${randomUUID()}-range.mp3`);
    try {
      await this.extractAudioRange(audioFilePath, rangePath, range);
      const text = await withRetry(
        async () => {
          // withTimeout は待つのをやめるだけなので、HTTP 要求自体も止めてソケットと帯域を解放する
          const controller = new AbortController();
          try {
            return await withTimeout(
              this.transcribeFile(rangePath, controller.signal),
              REQUEST_TIMEOUT_MS,
              ERROR_MESSAGES.TIMEOUT
            );
          } catch (error) {
            controller.abort();
            throw error;
          }
        },
        { maxRetries: MAX_RETRIES }
      );
      return text === '' ? null : { start: range.start, end: range.end, text };
    } finally {
      await unlink(rangePath).catch((err: unknown) => {
        console.warn('[TranscriptionService] 区間ファイルの削除に失敗しました:', err);
      });
    }
  }

  public async transcribe(
    videoFilePath: string,
    onProgress?: (completed: number, total: number) => Promise<void>
  ): Promise<TranscriptSegment[]> {
    // 動画と同じジョブ単位のディレクトリに置き、ジョブ終了時にまとめて片付けられるようにする
    const audioFilePath = join(dirname(videoFilePath), `quick-clip-audio-${randomUUID()}.mp3`);

    console.info(`[TranscriptionService] 音声抽出開始: videoFile=${videoFilePath}`);
    try {
      await this.extractAudio(videoFilePath, audioFilePath);
      const ranges = await this.detectSpeechRanges(audioFilePath);
      const total = ranges.length;
      console.info(`[TranscriptionService] 発話区間を検出: ranges=${total}`);

      const results: (TranscriptSegment | null)[] = new Array(total).fill(null);
      let nextIndex = 0;
      let completed = 0;
      let failed = false;
      let firstError: unknown;

      // 失敗後は進捗を通知せず新しい区間にも着手しない。
      // 実行中の worker は終わるまで待ち、親の音声ファイルを使い終えてから削除する
      const worker = async (): Promise<void> => {
        while (!failed && nextIndex < total) {
          const index = nextIndex;
          nextIndex += 1;
          try {
            const segment = await this.transcribeRange(audioFilePath, ranges[index]);
            if (failed) {
              return;
            }
            results[index] = segment;
            completed += 1;
            if (onProgress) {
              await onProgress(completed, total);
            }
          } catch (error) {
            if (!failed) {
              failed = true;
              firstError = error;
            }
            return;
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, total) }, () => worker()));
      if (failed) {
        throw firstError;
      }

      return results.filter((r): r is TranscriptSegment => r !== null);
    } finally {
      await unlink(audioFilePath).catch((err: unknown) => {
        console.warn('[TranscriptionService] 一時音声ファイルの削除に失敗しました:', err);
      });
    }
  }
}
