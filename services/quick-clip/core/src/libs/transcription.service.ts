import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
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

export class TranscriptionService {
  private readonly client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  private extractAudio(videoFilePath: string, audioOutputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-i',
        videoFilePath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        'wav',
        '-y',
        audioOutputPath,
      ]);

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

  public async transcribe(videoFilePath: string): Promise<TranscriptSegment[]> {
    const audioFilePath = `/tmp/quick-clip-audio-${randomUUID()}.wav`;

    await this.extractAudio(videoFilePath, audioFilePath);

    try {
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
    } finally {
      await unlink(audioFilePath).catch((err: unknown) => {
        console.warn('[TranscriptionService] 一時音声ファイルの削除に失敗しました:', err);
      });
    }
  }
}
