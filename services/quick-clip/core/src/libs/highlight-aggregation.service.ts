import type { ExtractedHighlight, HighlightScore, HighlightSource } from './highlight-extractor.service.js';

const MAX_HIGHLIGHTS = 20;
const CLIP_HALF_WINDOW_SECONDS = 10;

const isOverlapping = (left: ExtractedHighlight, right: ExtractedHighlight): boolean =>
  left.startSec < right.endSec && right.startSec < left.endSec;

const mergeSource = (left: HighlightSource, right: HighlightSource): HighlightSource => {
  if (left === right) {
    return left;
  }
  return 'both';
};

const mergeHighlights = (
  left: ExtractedHighlight,
  right: ExtractedHighlight
): ExtractedHighlight => ({
  startSec: Math.min(left.startSec, right.startSec),
  endSec: Math.max(left.endSec, right.endSec),
  score: Math.max(left.score, right.score),
  source: mergeSource(left.source, right.source),
});

const toClip = (
  peak: HighlightScore,
  source: Exclude<HighlightSource, 'both'>,
  duration: number
): ExtractedHighlight => ({
  startSec: Math.max(0, peak.second - CLIP_HALF_WINDOW_SECONDS),
  endSec: Math.min(duration, peak.second + CLIP_HALF_WINDOW_SECONDS),
  score: peak.score,
  source,
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
    duration: number
  ): ExtractedHighlight[] {
    const sortedMotion = [...motionScores].sort((a, b) => b.score - a.score);
    const sortedVolume = [...volumeScores].sort((a, b) => b.score - a.score);
    let motionIndex = 0;
    let volumeIndex = 0;
    let pickMotion = true;
    let accepted: ExtractedHighlight[] = [];

    while (accepted.length < MAX_HIGHLIGHTS) {
      const hasMotion = motionIndex < sortedMotion.length;
      const hasVolume = volumeIndex < sortedVolume.length;
      if (!hasMotion && !hasVolume) {
        break;
      }

      const shouldPickMotion = hasMotion && (!hasVolume || pickMotion);
      const picked = shouldPickMotion
        ? toClip(sortedMotion[motionIndex] as HighlightScore, 'motion', duration)
        : toClip(sortedVolume[volumeIndex] as HighlightScore, 'volume', duration);

      if (shouldPickMotion) {
        motionIndex += 1;
      } else {
        volumeIndex += 1;
      }
      pickMotion = !pickMotion;

      accepted = mergeIntoAccepted(accepted, picked);
    }

    return accepted.sort((a, b) => {
      if (a.startSec !== b.startSec) {
        return a.startSec - b.startSec;
      }
      if (a.endSec !== b.endSec) {
        return a.endSec - b.endSec;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.source !== b.source) {
        return a.source.localeCompare(b.source);
      }
      return 0;
    });
  }
}
