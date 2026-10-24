import {
  CLIP_REGENERATE_TIMEOUT_MS,
  findStuckGeneratingHighlights,
} from '@/lib/server/highlight-recovery';
import type { Highlight } from '@/types/quick-clip';

const NOW = 1700000000000;

const buildHighlight = (overrides: Partial<Highlight> = {}): Highlight => ({
  highlightId: 'h1',
  jobId: 'job-1',
  order: 1,
  startSec: 10,
  endSec: 20,
  source: 'motion',
  status: 'unconfirmed',
  clipStatus: 'GENERATING',
  expiresAt: NOW + 1000,
  ...overrides,
});

describe('findStuckGeneratingHighlights', () => {
  it('タイムアウトは作り直しの Lambda に合わせた 300 秒', () => {
    expect(CLIP_REGENERATE_TIMEOUT_MS).toBe(300000);
  });

  it('GENERATING にしてから 300 秒を過ぎたものを返す', () => {
    const stuck = buildHighlight({
      clipGeneratingStartedAt: NOW - CLIP_REGENERATE_TIMEOUT_MS - 1,
    });

    expect(findStuckGeneratingHighlights([stuck], NOW)).toEqual([stuck]);
  });

  it('ちょうど 300 秒の見どころはまだ対象にしない', () => {
    const boundary = buildHighlight({
      clipGeneratingStartedAt: NOW - CLIP_REGENERATE_TIMEOUT_MS,
    });

    expect(findStuckGeneratingHighlights([boundary], NOW)).toEqual([]);
  });

  it('300 秒に満たない作り直し中の見どころは対象にしない', () => {
    const running = buildHighlight({ clipGeneratingStartedAt: NOW - 1000 });

    expect(findStuckGeneratingHighlights([running], NOW)).toEqual([]);
  });

  it('GENERATING にした時刻が無い見どころは対象にしない', () => {
    expect(findStuckGeneratingHighlights([buildHighlight()], NOW)).toEqual([]);
  });

  it('GENERATING 以外は、時刻が古くても対象にしない', () => {
    const highlights = (['PENDING', 'GENERATED', 'FAILED'] as const).map((clipStatus, index) =>
      buildHighlight({
        highlightId: `h${index}`,
        clipStatus,
        clipGeneratingStartedAt: NOW - CLIP_REGENERATE_TIMEOUT_MS * 10,
      })
    );

    expect(findStuckGeneratingHighlights(highlights, NOW)).toEqual([]);
  });

  it('複数の見どころから該当するものだけを選ぶ', () => {
    const stuck = buildHighlight({
      highlightId: 'stuck',
      clipGeneratingStartedAt: NOW - CLIP_REGENERATE_TIMEOUT_MS - 1,
    });
    const running = buildHighlight({
      highlightId: 'running',
      clipGeneratingStartedAt: NOW - 10,
    });

    expect(findStuckGeneratingHighlights([running, stuck], NOW)).toEqual([stuck]);
  });
});
