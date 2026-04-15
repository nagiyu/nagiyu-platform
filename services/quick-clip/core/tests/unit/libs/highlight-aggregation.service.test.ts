import { HighlightAggregationService } from '../../../src/libs/highlight-aggregation.service.js';
import type {
  EmotionHighlightScore,
  HighlightScore,
} from '../../../src/libs/highlight-extractor.service.js';

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

  it('emotionScores を渡すと3ソース round-robin で選択される', () => {
    const motionScores: HighlightScore[] = [{ second: 30, score: 100 }];
    const volumeScores: HighlightScore[] = [{ second: 60, score: 90 }];
    const emotionScores: EmotionHighlightScore[] = [
      { second: 90, score: 80, dominantEmotion: 'laugh' },
    ];
    const service = new HighlightAggregationService();

    const result = service.aggregate(motionScores, volumeScores, 200, emotionScores);

    expect(result).toEqual([
      { startSec: 20, endSec: 40, score: 100, source: 'motion' },
      { startSec: 50, endSec: 70, score: 90, source: 'volume' },
      { startSec: 80, endSec: 100, score: 80, source: 'emotion', dominantEmotion: 'laugh' },
    ]);
  });

  it('emotion ソースと他ソースが重複する場合は統合される', () => {
    const motionScores: HighlightScore[] = [{ second: 30, score: 100 }];
    const emotionScores: EmotionHighlightScore[] = [
      { second: 35, score: 80, dominantEmotion: 'excite' },
    ];
    const service = new HighlightAggregationService();

    const result = service.aggregate(motionScores, [], 200, emotionScores);

    // motion (score=100) が emotion (score=80) より高スコアのため dominantEmotion は引き継がれない
    expect(result).toEqual([{ startSec: 20, endSec: 45, score: 100, source: 'both' }]);
    expect(result[0]?.dominantEmotion).toBeUndefined();
  });

  it('emotionScores が空配列の場合は2ソース動作を維持する', () => {
    const motionScores: HighlightScore[] = [
      { second: 20, score: 100 },
      { second: 80, score: 90 },
    ];
    const volumeScores: HighlightScore[] = [
      { second: 25, score: 95 },
      { second: 140, score: 85 },
    ];
    const service = new HighlightAggregationService();

    const result = service.aggregate(motionScores, volumeScores, 200, []);

    expect(result).toEqual([
      { startSec: 10, endSec: 35, score: 100, source: 'both' },
      { startSec: 70, endSec: 90, score: 90, source: 'motion' },
      { startSec: 130, endSec: 150, score: 85, source: 'volume' },
    ]);
  });

  it('emotionScores のみの場合は emotion ソースとして選択される', () => {
    const emotionScores: EmotionHighlightScore[] = [
      { second: 30, score: 100, dominantEmotion: 'tension' },
      { second: 70, score: 90, dominantEmotion: 'touch' },
    ];
    const service = new HighlightAggregationService();

    const result = service.aggregate([], [], 200, emotionScores);

    expect(result).toEqual([
      { startSec: 20, endSec: 40, score: 100, source: 'emotion', dominantEmotion: 'tension' },
      { startSec: 60, endSec: 80, score: 90, source: 'emotion', dominantEmotion: 'touch' },
    ]);
  });

  it('emotion ソース重複時のマージで score が高い側の dominantEmotion が使われる', () => {
    const emotionScores: EmotionHighlightScore[] = [
      { second: 30, score: 80, dominantEmotion: 'laugh' },
      { second: 35, score: 100, dominantEmotion: 'excite' },
    ];
    const service = new HighlightAggregationService();

    const result = service.aggregate([], [], 200, emotionScores);

    expect(result).toEqual([
      { startSec: 20, endSec: 45, score: 100, source: 'emotion', dominantEmotion: 'excite' },
    ]);
  });
});
