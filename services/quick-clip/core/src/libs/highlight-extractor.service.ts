export type EmotionLabel = 'laugh' | 'excite' | 'touch' | 'tension';
export type EmotionFilter = EmotionLabel | 'any';

export type HighlightSource = 'motion' | 'volume' | 'emotion' | 'both';

export type HighlightScore = {
  second: number;
  score: number;
};

export type EmotionScore = {
  second: number;
  laugh: number;
  excite: number;
  touch: number;
  tension: number;
};

export type EmotionHighlightScore = {
  second: number;
  score: number;
  dominantEmotion: EmotionLabel;
};

export type ExtractedHighlight = {
  startSec: number;
  endSec: number;
  score: number;
  source: HighlightSource;
  dominantEmotion?: EmotionLabel;
};
