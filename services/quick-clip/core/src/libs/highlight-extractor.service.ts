export type HighlightSource = 'motion' | 'volume' | 'both';

export type ExtractedHighlight = {
  startSec: number;
  endSec: number;
  score: number;
  source: HighlightSource;
};

export interface HighlightExtractorService {
  extractHighlights(jobId: string, videoFilePath: string): Promise<ExtractedHighlight[]>;
}
