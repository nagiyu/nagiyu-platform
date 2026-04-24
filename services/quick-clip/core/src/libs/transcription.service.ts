import { createReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import { withRetry } from '@nagiyu/common';

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

const ERROR_MESSAGES = {
  AUDIO_EXTRACT_FAILED: '音声の抽出に失敗しました',
  TIMEOUT: 'Whisper APIの呼び出しがタイムアウトしました',
} as const;

const MAX_FILE_SIZE_BYTES = 24 * 1024 * 1024; // チャンク判定閾値（変更しない）
const CHUNK_TARGET_SIZE_BYTES = 10 * 1024 * 1024; // チャンクサイズ計算用
const MP3_BYTES_PER_SEC = 32000 / 8;
const CHUNK_DURATION_SEC = Math.floor(CHUNK_TARGET_SIZE_BYTES / MP3_BYTES_PER_SEC);

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 600_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(ERROR_MESSAGES.TIMEOUT));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

const NO_SPEECH_PROB_THRESHOLD = 0.6; // Whisper 公式の無音声判定値
const AVG_LOGPROB_THRESHOLD = -1.0; // モデルの不確かさ閾値
const COMPRESSION_RATIO_THRESHOLD = 2.4; // 繰り返しテキスト検出値

type RawSegment = {
  start: number;
  end: number;
  text: string;
  no_speech_prob: number;
  avg_logprob: number;
  compression_ratio: number;
};

export class TranscriptionService {
  private readonly client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';
      ffmpeg.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`${ERROR_MESSAGES.AUDIO_EXTRACT_FAILED}: ${error.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(`${ERROR_MESSAGES.AUDIO_EXTRACT_FAILED}: exit code ${code}, stderr: ${stderr}`)
        );
      });
    });
  }

  private extractAudio(videoFilePath: string, audioOutputPath: string): Promise<void> {
    return this.runFfmpeg([
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
    ]);
  }

  private extractAudioChunk(
    audioFilePath: string,
    chunkOutputPath: string,
    startSec: number,
    durationSec: number
  ): Promise<void> {
    return this.runFfmpeg([
      '-hide_banner',
      '-ss',
      String(startSec),
      '-i',
      audioFilePath,
      '-t',
      String(durationSec),
      '-c:a',
      'copy',
      '-y',
      chunkOutputPath,
    ]);
  }

  private async transcribeFile(audioFilePath: string): Promise<TranscriptSegment[]> {
    const response = await this.client.audio.transcriptions.create({
      model: 'whisper-1',
      file: createReadStream(audioFilePath),
      response_format: 'verbose_json',
      language: 'ja',
    });

    const segments = (response as { segments?: RawSegment[] }).segments;

    if (!segments) {
      return [];
    }

    return segments
      .filter(
        (s) =>
          s.no_speech_prob <= NO_SPEECH_PROB_THRESHOLD &&
          s.avg_logprob >= AVG_LOGPROB_THRESHOLD &&
          s.compression_ratio <= COMPRESSION_RATIO_THRESHOLD
      )
      .map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      }));
  }

  public async transcribe(videoFilePath: string): Promise<TranscriptSegment[]> {
    const audioFilePath = `/tmp/quick-clip-audio-${randomUUID()}.mp3`;

    console.info(`[TranscriptionService] 音声抽出開始: videoFile=${videoFilePath}`);
    await this.extractAudio(videoFilePath, audioFilePath);

    try {
      const { size } = await stat(audioFilePath);
      console.info(
        `[TranscriptionService] 音声抽出完了: audioFile=${audioFilePath} size=${size}bytes`
      );

      if (size <= MAX_FILE_SIZE_BYTES) {
        console.info(`[TranscriptionService] 単一ファイルで文字起こし: size=${size}bytes`);
        return await withRetry(
          async () => withTimeout(this.transcribeFile(audioFilePath), REQUEST_TIMEOUT_MS),
          { maxRetries: MAX_RETRIES }
        );
      }

      // ファイルサイズからおおよその長さを推定し、チャンク数を算出する
      const estimatedDurationSec = size / MP3_BYTES_PER_SEC;
      const numChunks = Math.ceil(estimatedDurationSec / CHUNK_DURATION_SEC);
      console.info(
        `[TranscriptionService] チャンク分割して文字起こし: size=${size}bytes numChunks=${numChunks}`
      );
      const chunkSegments = await Promise.all(
        Array.from({ length: numChunks }, async (_, i) => {
          const startSec = i * CHUNK_DURATION_SEC;
          const chunkPath = `/tmp/quick-clip-audio-${randomUUID()}-chunk-${i}.mp3`;
          await this.extractAudioChunk(audioFilePath, chunkPath, startSec, CHUNK_DURATION_SEC);
          const { size: chunkSize } = await stat(chunkPath);
          console.info(
            `[TranscriptionService] チャンク${i + 1}/${numChunks} 文字起こし開始: size=${chunkSize}bytes`
          );
          try {
            const segments = await withRetry(
              async () => withTimeout(this.transcribeFile(chunkPath), REQUEST_TIMEOUT_MS),
              { maxRetries: MAX_RETRIES }
            );
            console.info(
              `[TranscriptionService] チャンク${i + 1}/${numChunks} 文字起こし完了: segments=${segments.length}`
            );
            return segments.map((s) => ({
              start: s.start + startSec,
              end: s.end + startSec,
              text: s.text,
            }));
          } finally {
            await unlink(chunkPath).catch((err: unknown) => {
              console.warn('[TranscriptionService] チャンクファイルの削除に失敗しました:', err);
            });
          }
        })
      );

      return chunkSegments.flat();
    } finally {
      await unlink(audioFilePath).catch((err: unknown) => {
        console.warn('[TranscriptionService] 一時音声ファイルの削除に失敗しました:', err);
      });
    }
  }
}
