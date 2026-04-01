import type {
  ExtractedHighlight,
  HighlightExtractorService,
} from './highlight-extractor.service.js';

const MAX_HIGHLIGHTS = 20;

// 境界が接する場合（endSec === startSec）も同一帯域として扱い、統合対象に含める。
const isOverlapping = (left: ExtractedHighlight, right: ExtractedHighlight): boolean =>
  left.startSec <= right.endSec && right.startSec <= left.endSec;

// 同種同士は個別候補として維持し、motion/volume の組み合わせのみ統合する。
const canMergeSource = (left: ExtractedHighlight, right: ExtractedHighlight): boolean =>
  (left.source === 'motion' && right.source === 'volume') ||
  (left.source === 'volume' && right.source === 'motion');

const mergeHighlights = (
  left: ExtractedHighlight,
  right: ExtractedHighlight
): ExtractedHighlight => ({
  startSec: Math.min(left.startSec, right.startSec),
  endSec: Math.max(left.endSec, right.endSec),
  score: Math.max(left.score, right.score),
  source: 'both',
});

export class HighlightAggregationService {
  private readonly extractors: ReadonlyArray<HighlightExtractorService>;

  constructor(extractors: ReadonlyArray<HighlightExtractorService>) {
    this.extractors = extractors;
  }

  public async aggregate(jobId: string, videoFilePath: string): Promise<ExtractedHighlight[]> {
    const extractionResults = await Promise.all(
      this.extractors.map((extractor) => extractor.extractHighlights(jobId, videoFilePath))
    );

    const merged = extractionResults
      .flat()
      .reduce<ExtractedHighlight[]>((current, candidate) => {
        const overlappingIndex = current.findIndex(
          (existing) => isOverlapping(existing, candidate) && canMergeSource(existing, candidate)
        );

        if (overlappingIndex === -1) {
          current.push(candidate);
          return current;
        }

        const existing = current[overlappingIndex] as ExtractedHighlight;
        current[overlappingIndex] = mergeHighlights(existing, candidate);
        return current;
      }, []);

    return merged
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
