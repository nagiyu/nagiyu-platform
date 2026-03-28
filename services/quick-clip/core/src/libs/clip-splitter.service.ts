import type { Highlight } from '../types.js';

export interface ClipSplitterService {
  splitClips(jobId: string, videoFilePath: string, highlights: Highlight[]): Promise<string[]>;
}
