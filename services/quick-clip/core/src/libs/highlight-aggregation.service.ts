import type {
  EmotionHighlightScore,
  EmotionLabel,
  ExtractedHighlight,
  HighlightScore,
  HighlightSource,
} from './highlight-extractor.service.js';

const MAX_HIGHLIGHTS = 20;
const CLIP_HALF_WINDOW_SECONDS = 10;

// 「1秒でも被る場合のみ統合」のため、境界接触 (end === start) は重複とみなさない。
const isOverlapping = (left: ExtractedHighlight, right: ExtractedHighlight): boolean =>
  left.startSec < right.endSec && right.startSec < left.endSec;

const mergeSource = (left: HighlightSource, right: HighlightSource): HighlightSource => {
  if (left === 'both' || right === 'both') {
    return 'both';
  }
  if (left === right) {
    return left;
  }
  return 'both';
};

const mergeHighlights = (
  left: ExtractedHighlight,
  right: ExtractedHighlight
): ExtractedHighlight => {
  const winner = left.score >= right.score ? left : right;
  return {
    startSec: Math.min(left.startSec, right.startSec),
    endSec: Math.max(left.endSec, right.endSec),
    score: Math.max(left.score, right.score),
    source: mergeSource(left.source, right.source),
    ...(winner.dominantEmotion !== undefined ? { dominantEmotion: winner.dominantEmotion } : {}),
  };
};

const toClip = (
  peak: HighlightScore,
  source: Exclude<HighlightSource, 'both'>,
  duration: number,
  dominantEmotion?: EmotionLabel
): ExtractedHighlight => ({
  startSec: Math.max(0, peak.second - CLIP_HALF_WINDOW_SECONDS),
  endSec: Math.min(duration, peak.second + CLIP_HALF_WINDOW_SECONDS),
  score: peak.score,
  source,
  dominantEmotion,
});

const mergeIntoAccepted = (
  accepted: ExtractedHighlight[],
  candidate: ExtractedHighlight
): ExtractedHighlight[] => {
  let mergedCandidate = candidate;
  const remained: ExtractedHighlight[] = [];
  for (const existing of accepted) {
    if (isOverlapping(existing, mergedCandidate)) {
      mergedCandidate = mergeHighlights(existing, mergedCandidate);
      continue;
    }
    remained.push(existing);
  }
  remained.push(mergedCandidate);
  return remained;
};

export class HighlightAggregationService {
  public aggregate(
    motionScores: HighlightScore[],
    volumeScores: HighlightScore[],
    duration: number,
    emotionScores?: EmotionHighlightScore[]
  ): ExtractedHighlight[] {
    const sortedMotion = [...motionScores].sort((a, b) => b.score - a.score);
    const sortedVolume = [...volumeScores].sort((a, b) => b.score - a.score);
    const sortedEmotion = emotionScores ? [...emotionScores].sort((a, b) => b.score - a.score) : [];
    const hasEmotion = sortedEmotion.length > 0;
    const sourceCount = hasEmotion ? 3 : 2;
    let motionIndex = 0;
    let volumeIndex = 0;
    let emotionIndex = 0;
    let currentSourceIdx = 0;
    let accepted: ExtractedHighlight[] = [];

    while (accepted.length < MAX_HIGHLIGHTS) {
      const hasMotion = motionIndex < sortedMotion.length;
      const hasVolume = volumeIndex < sortedVolume.length;
      const hasEmotionLeft = emotionIndex < sortedEmotion.length;
      if (!hasMotion && !hasVolume && !hasEmotionLeft) {
        break;
      }

      const sourceSlot = currentSourceIdx % sourceCount;
      currentSourceIdx++;

      let picked: ExtractedHighlight | null = null;
      if (sourceSlot === 0) {
        if (hasMotion) {
          picked = toClip(sortedMotion[motionIndex] as HighlightScore, 'motion', duration);
          motionIndex++;
        }
      } else if (sourceSlot === 1) {
        if (hasVolume) {
          picked = toClip(sortedVolume[volumeIndex] as HighlightScore, 'volume', duration);
          volumeIndex++;
        }
      } else {
        if (hasEmotionLeft) {
          const peak = sortedEmotion[emotionIndex] as EmotionHighlightScore;
          picked = toClip(peak, 'emotion', duration, peak.dominantEmotion);
          emotionIndex++;
        }
      }

      if (picked === null) {
        continue;
      }

      accepted = mergeIntoAccepted(accepted, picked);
    }

    return accepted.sort((a, b) => a.startSec - b.startSec);
  }
}
