import { createReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

const ERROR_MESSAGES = {
  AUDIO_EXTRACT_FAILED: '音声の抽出に失敗しました',
} as const;

const MAX_FILE_SIZE_BYTES = 24 * 1024 * 1024;
const MP3_BYTES_PER_SEC = 32000 / 8;
const CHUNK_DURATION_SEC = Math.floor(MAX_FILE_SIZE_BYTES / MP3_BYTES_PER_SEC);

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

    const segments = (response as { segments?: { start: number; end: number; text: string }[] })
      .segments;

    if (!segments) {
      return [];
    }

    return segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }));
  }

  public async transcribe(videoFilePath: string): Promise<TranscriptSegment[]> {
    const audioFilePath = `/tmp/quick-clip-audio-${randomUUID()}.mp3`;

    await this.extractAudio(videoFilePath, audioFilePath);

    try {
      const { size } = await stat(audioFilePath);

      if (size <= MAX_FILE_SIZE_BYTES) {
        return await this.transcribeFile(audioFilePath);
      }

      const estimatedDurationSec = size / MP3_BYTES_PER_SEC;
      const numChunks = Math.ceil(estimatedDurationSec / CHUNK_DURATION_SEC);
      const allSegments: TranscriptSegment[] = [];

      for (let i = 0; i < numChunks; i++) {
        const startSec = i * CHUNK_DURATION_SEC;
        const chunkPath = `/tmp/quick-clip-audio-${randomUUID()}-chunk-${i}.mp3`;
        await this.extractAudioChunk(audioFilePath, chunkPath, startSec, CHUNK_DURATION_SEC);
        try {
          const segments = await this.transcribeFile(chunkPath);
          allSegments.push(
            ...segments.map((s) => ({
              start: s.start + startSec,
              end: s.end + startSec,
              text: s.text,
            }))
          );
        } finally {
          await unlink(chunkPath).catch((err: unknown) => {
            console.warn('[TranscriptionService] チャンクファイルの削除に失敗しました:', err);
          });
        }
      }

      return allSegments;
    } finally {
      await unlink(audioFilePath).catch((err: unknown) => {
        console.warn('[TranscriptionService] 一時音声ファイルの削除に失敗しました:', err);
      });
    }
  }
}
