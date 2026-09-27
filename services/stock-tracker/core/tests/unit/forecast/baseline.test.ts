import {
  baselineOffset,
  clipBaseline,
  computeRollingBaseline,
} from '../../../src/forecast/baseline.js';
import { logit } from '../../../src/forecast/stats.js';
import { nominalMarketCloseTime } from '../../../src/forecast/time.js';
import { REAL_EXCHANGES } from './support/exchanges.js';

/** テスト内の既存呼び出し（date, market の順）に合わせた薄いラッパー */
const nominalCloseTime = (date: string, market: string) =>
  nominalMarketCloseTime(market, date, REAL_EXCHANGES);

describe('computeRollingBaseline', () => {
  it('既知サンプルが 0 件なら 0.5', () => {
    const result = computeRollingBaseline({
      calendar: { JP: ['2026-01-01', '2026-01-02'], US: [] },
      samples: [],
      predTimeOf: nominalCloseTime,
    });
    expect(result.JP['2026-01-01']).toBe(0.5);
    expect(result.JP['2026-01-02']).toBe(0.5);
  });

  it('20件未満のときは既知の全サンプルの平均を使う', () => {
    const cal = { JP: ['2026-01-01', '2026-01-02', '2026-01-03'], US: [] };
    const samples = [
      {
        market: 'JP' as const,
        date: '2026-01-01',
        labelTime: nominalCloseTime('2026-01-02', 'JP'),
        y: 1,
      },
      {
        market: 'JP' as const,
        date: '2026-01-02',
        labelTime: nominalCloseTime('2026-01-03', 'JP'),
        y: 0,
      },
    ];
    const result = computeRollingBaseline({
      calendar: cal,
      samples,
      predTimeOf: nominalCloseTime,
      minCount: 20,
      window: 60,
    });
    // 2026-01-03 時点で知り得るのは上記2件（labelTime <= predTime(2026-01-03,'JP')）
    expect(result.JP['2026-01-03']).toBeCloseTo(0.5, 8);
  });

  it('将来のサンプルは含めない（時刻の規則）', () => {
    const cal = { JP: ['2026-01-01', '2026-01-02', '2026-01-03'], US: [] };
    const samples = [
      // 2026-01-02 のサンプルは翌営業日(01-03)の引けで確定 -> 01-02 の予測時点ではまだ未確定
      {
        market: 'JP' as const,
        date: '2026-01-02',
        labelTime: nominalCloseTime('2026-01-03', 'JP'),
        y: 1,
      },
    ];
    const result = computeRollingBaseline({ calendar: cal, samples, predTimeOf: nominalCloseTime });
    expect(result.JP['2026-01-02']).toBe(0.5); // まだ知り得ない -> 0.5
    expect(result.JP['2026-01-03']).toBeCloseTo(1, 8); // 01-03 の引け以降は知り得る
  });

  it('20件以上たまれば直近60営業日の的中率を使う（古いサンプルは窓外）', () => {
    const dates = Array.from(
      { length: 100 },
      (_, i) =>
        `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`
    );
    const cal = { JP: dates, US: [] };
    // 最初の39件は y=0、残り60件は y=1（直近60営業日の窓 = index 39..98 がちょうど y=1 のみになる）
    const samples = dates.slice(0, 99).map((d, i) => ({
      market: 'JP' as const,
      date: d,
      labelTime: nominalCloseTime(dates[i + 1], 'JP'),
      y: i < 39 ? 0 : 1,
    }));
    const result = computeRollingBaseline({
      calendar: cal,
      samples,
      predTimeOf: nominalCloseTime,
      window: 60,
      minCount: 20,
    });
    const last = dates[dates.length - 1];
    expect(result.JP[last]).toBeCloseTo(1, 8);
  });
});

describe('clipBaseline / baselineOffset', () => {
  it('0.02未満は0.02にクリップ', () => {
    expect(clipBaseline(0.001)).toBe(0.02);
  });
  it('0.98超は0.98にクリップ', () => {
    expect(clipBaseline(0.999)).toBe(0.98);
  });
  it('範囲内はそのまま', () => {
    expect(clipBaseline(0.4)).toBe(0.4);
  });
  it('baselineOffset はクリップ後の logit', () => {
    expect(baselineOffset(0.999)).toBeCloseTo(logit(0.98), 8);
  });
});
