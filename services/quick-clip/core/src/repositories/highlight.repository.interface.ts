import type { Highlight, UpdateHighlightInput } from '../types.js';

export interface HighlightRepository {
  getByJobId(jobId: string): Promise<Highlight[]>;
  getById(jobId: string, highlightId: string): Promise<Highlight | null>;
  update(jobId: string, highlightId: string, updates: UpdateHighlightInput): Promise<Highlight>;
}
