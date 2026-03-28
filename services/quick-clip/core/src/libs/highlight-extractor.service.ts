export type ExtractedHighlight = {
  startSec: number;
  endSec: number;
  score: number;
  source: string;
};

export interface HighlightExtractorService {
  extractHighlights(jobId: string, videoFilePath: string): Promise<ExtractedHighlight[]>;
}
