import { HighlightAggregationService } from '../../../src/libs/highlight-aggregation.service.js';
import type { HighlightScore } from '../../../src/libs/highlight-extractor.service.js';

describe('HighlightAggregationService', () => {
  it('motion と volume を交互に選び、重複時に both で統合する', () => {
    const motionScores: HighlightScore[] = [
      { second: 20, score: 100 },
      { second: 80, score: 90 },
    ];
    const volumeScores: HighlightScore[] = [
      { second: 25, score: 95 },
      { second: 140, score: 85 },
    ];
    const service = new HighlightAggregationService();

    const result = service.aggregate(motionScores, volumeScores, 200);

    expect(result).toEqual([
      { startSec: 10, endSec: 35, score: 100, source: 'both' },
      { startSec: 70, endSec: 90, score: 90, source: 'motion' },
      { startSec: 130, endSec: 150, score: 85, source: 'volume' },
    ]);
  });

  it('動画端では [max(0,t-10), min(duration,t+10)] でクランプされる', () => {
    const service = new HighlightAggregationService();

    const result = service.aggregate([{ second: 3, score: 10 }], [{ second: 58, score: 9 }], 60);

    expect(result).toEqual([
      { startSec: 0, endSec: 13, score: 10, source: 'motion' },
      { startSec: 48, endSec: 60, score: 9, source: 'volume' },
    ]);
  });

  it('連鎖的に重複する区間は1件に統合される', () => {
    const motionScores: HighlightScore[] = [{ second: 20, score: 10 }];
    const volumeScores: HighlightScore[] = [
      { second: 35, score: 9 },
      { second: 50, score: 8 },
    ];
    const service = new HighlightAggregationService();

    const result = service.aggregate(motionScores, volumeScores, 200);

    expect(result).toEqual([{ startSec: 10, endSec: 60, score: 10, source: 'both' }]);
  });

  it('重複しない場合は最大20件で打ち切る', () => {
    const motionScores: HighlightScore[] = Array.from({ length: 30 }, (_, index) => ({
      second: index * 25 + 10,
      score: 100 - index,
    }));
    const service = new HighlightAggregationService();

    const result = service.aggregate(motionScores, [], 10000);

    expect(result).toHaveLength(20);
  });
});
