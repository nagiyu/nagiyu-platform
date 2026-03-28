import type {
  ExtractedHighlight,
  HighlightExtractorService,
} from './highlight-extractor.service.js';

const MAX_HIGHLIGHTS = 20;

export class HighlightAggregationService {
  private readonly extractors: ReadonlyArray<HighlightExtractorService>;

  constructor(extractors: ReadonlyArray<HighlightExtractorService>) {
    this.extractors = extractors;
  }

  public async aggregate(jobId: string, videoFilePath: string): Promise<ExtractedHighlight[]> {
    const extractionResults = await Promise.all(
      this.extractors.map((extractor) => extractor.extractHighlights(jobId, videoFilePath))
    );

    return extractionResults
      .flat()
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (a.startSec !== b.startSec) {
          return a.startSec - b.startSec;
        }
        return a.endSec - b.endSec;
      })
      .slice(0, MAX_HIGHLIGHTS);
  }
}
