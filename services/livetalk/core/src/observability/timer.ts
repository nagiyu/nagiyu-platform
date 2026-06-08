import { performance } from 'perf_hooks';

export interface PhaseTimer {
  start(phase: string): void;
  end(phase: string): number;
  elapsedMs(phase: string): number | undefined;
}

/**
 * フェーズごとのレイテンシ計測ヘルパー。
 * performance.now() ベース（ミリ秒精度、整数に丸める）。
 */
export function createPhaseTimer(): PhaseTimer {
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();

  return {
    start(phase: string): void {
      starts.set(phase, performance.now());
    },
    end(phase: string): number {
      const startTime = starts.get(phase);
      if (startTime === undefined) return 0;
      const endTime = performance.now();
      ends.set(phase, endTime);
      return Math.round(endTime - startTime);
    },
    elapsedMs(phase: string): number | undefined {
      const startTime = starts.get(phase);
      const endTime = ends.get(phase);
      if (startTime === undefined || endTime === undefined) return undefined;
      return Math.round(endTime - startTime);
    },
  };
}
