import { HighlightAggregationService } from '../../../src/libs/highlight-aggregation.service.js';
import type {
  ExtractedHighlight,
  HighlightExtractorService,
} from '../../../src/libs/highlight-extractor.service.js';

const createExtractorMock = (
  result: ExtractedHighlight[]
): jest.Mocked<HighlightExtractorService> => ({
  extractHighlights: jest.fn().mockResolvedValue(result),
});

describe('HighlightAggregationService', () => {
  it('複数 extractor の結果を score 降順で統合する', async () => {
    const first = createExtractorMock([
      { startSec: 10, endSec: 15, score: 20, source: 'motion' },
      { startSec: 5, endSec: 8, score: 30, source: 'motion' },
    ]);
    const second = createExtractorMock([
      { startSec: 12, endSec: 16, score: 25, source: 'volume' },
    ]);
    const service = new HighlightAggregationService([first, second]);

    const result = await service.aggregate('job-1', '/tmp/video.mp4');

    expect(result).toEqual([
      { startSec: 5, endSec: 8, score: 30, source: 'motion' },
      { startSec: 12, endSec: 16, score: 25, source: 'volume' },
      { startSec: 10, endSec: 15, score: 20, source: 'motion' },
    ]);
    expect(first.extractHighlights).toHaveBeenCalledWith('job-1', '/tmp/video.mp4');
    expect(second.extractHighlights).toHaveBeenCalledWith('job-1', '/tmp/video.mp4');
  });

  it('同スコアの場合は開始時刻・終了時刻で昇順に並べる', async () => {
    const extractor = createExtractorMock([
      { startSec: 20, endSec: 30, score: 10, source: 'motion' },
      { startSec: 10, endSec: 20, score: 10, source: 'motion' },
      { startSec: 10, endSec: 15, score: 10, source: 'motion' },
    ]);
    const service = new HighlightAggregationService([extractor]);

    const result = await service.aggregate('job-1', '/tmp/video.mp4');

    expect(result).toEqual([
      { startSec: 10, endSec: 15, score: 10, source: 'motion' },
      { startSec: 10, endSec: 20, score: 10, source: 'motion' },
      { startSec: 20, endSec: 30, score: 10, source: 'motion' },
    ]);
  });

  it('結果は最大20件に制限する', async () => {
    const manyHighlights: ExtractedHighlight[] = Array.from({ length: 25 }, (_, index) => ({
      startSec: index,
      endSec: index + 1,
      score: 100 - index,
      source: 'motion',
    }));
    const extractor = createExtractorMock(manyHighlights);
    const service = new HighlightAggregationService([extractor]);

    const result = await service.aggregate('job-1', '/tmp/video.mp4');

    expect(result).toHaveLength(20);
    expect(result[0]?.score).toBe(100);
    expect(result[19]?.score).toBe(81);
  });
});
