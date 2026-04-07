export type HighlightSource = 'motion' | 'volume' | 'both';

export type HighlightScore = {
  second: number;
  score: number;
};

export type ExtractedHighlight = {
  startSec: number;
  endSec: number;
  score: number;
  source: HighlightSource;
};
