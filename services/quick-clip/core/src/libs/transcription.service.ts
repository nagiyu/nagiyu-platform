import { createReadStream } from 'node:fs';
import type OpenAI from 'openai';

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export class TranscriptionService {
  private readonly client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  public async transcribe(audioFilePath: string): Promise<TranscriptSegment[]> {
    const response = await this.client.audio.transcriptions.create({
      model: 'gpt-4o-mini-transcribe',
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
}
