import {
  buildAxisPerformanceHref,
  buildForecastLabel,
  buildLitParts,
  formatAxisPerformance,
  formatAxisValue,
  formatBandHistory,
  formatContribution,
  formatLit,
  formatPercent,
  formatProbability,
  formatProbabilityWithUsual,
  formatReferenceDate,
  formatUsualRate,
  isBandLowSample,
  resolveLabelSlotWidthRem,
  resolveMarketNotes,
  resolveUnavailableReason,
  splitAxes,
  toProbabilityView,
} from '../../../../lib/forecast-view/labels';
import type { AxisBreakdown, QuestionDetail } from '../../../../types/forecast';

const axis = (overrides: Partial<AxisBreakdown>): AxisBreakdown => ({
  axisId: 'a',
  name: '軸',
  kind: 'FLAG',
  performance: { count: 100, hitRate: 0.57, diffFromBaseline: 0.032 },
  contribution: 0,
  lowSample: false,
  ...overrides,
});

describe('buildForecastLabel', () => {
  it('確度がなければ「—」を返す', () => {
    expect(buildForecastLabel('DIR', null)).toEqual({ text: '—', tone: 'none' });
    expect(buildForecastLabel('VOL', undefined)).toEqual({ text: '—', tone: 'none' });
  });

  it('方向: UP は P(上回る) を強含みで表示する', () => {
    expect(buildForecastLabel('DIR', { probability: 0.56, baseline: 0.5, lean: 'UP' })).toEqual({
      text: '強含み',
      tone: 'up',
    });
  });

  it('方向: DOWN は確率を含めず弱含みだけを返す', () => {
    expect(buildForecastLabel('DIR', { probability: 0.42, baseline: 0.5, lean: 'DOWN' })).toEqual({
      text: '弱含み',
      tone: 'down',
    });
  });

  it('方向: 中立帯の内側は「中立」を控えめな色で返す', () => {
    expect(buildForecastLabel('DIR', { probability: 0.5, baseline: 0.5, lean: 'NEUTRAL' })).toEqual(
      { text: '中立', tone: 'muted' }
    );
  });

  it.each(['VOL', 'MKT'] as const)('%s: HIGH は荒れそう、それ以外は平常', (question) => {
    expect(
      buildForecastLabel(question, { probability: 0.64, baseline: 0.5, lean: 'HIGH' })
    ).toEqual({ text: '荒れそう', tone: 'high' });
    expect(buildForecastLabel(question, { probability: 0.3, baseline: 0.5, lean: 'DOWN' })).toEqual(
      { text: '平常', tone: 'muted' }
    );
    expect(
      buildForecastLabel(question, { probability: 0.5, baseline: 0.5, lean: 'NEUTRAL' })
    ).toEqual({ text: '平常', tone: 'muted' });
  });
});

describe('数値の書式', () => {
  it('確率を整数 % にする', () => {
    expect(formatPercent(0.5649)).toBe('56%');
    expect(formatPercent(0.567)).toBe('57%');
  });

  it('方向の確率は下側でも上回る確率をそのまま出す', () => {
    expect(formatProbability('DIR', 0.42)).toBe('上回る確率 42%');
    expect(formatProbability('DIR', 0.49)).toBe('上回る確率 49%');
  });

  it.each(['VOL', 'MKT'] as const)('%s の確率は「荒れる確率」で出す', (question) => {
    expect(formatProbability(question, 0.3)).toBe('荒れる確率 30%');
  });

  it('基準値を「ふだん 37%」にする', () => {
    expect(formatUsualRate(0.37)).toBe('ふだん 37%');
  });

  it('確率とふだんの割合を並べる', () => {
    expect(formatProbabilityWithUsual('VOL', { probability: 0.23, baseline: 0.37 })).toBe(
      '荒れる確率 23% (ふだん 37%)'
    );
    expect(formatProbabilityWithUsual('DIR', { probability: 0.49, baseline: 0.5 })).toBe(
      '上回る確率 49% (ふだん 50%)'
    );
  });

  it('寄与を小数 1 桁の pt にする', () => {
    expect(formatContribution(0.021)).toBe('+2.1pt');
    expect(formatContribution(-0.008)).toBe('−0.8pt');
    expect(formatContribution(0)).toBe('0.0pt');
    expect(formatContribution(0.00001)).toBe('0.0pt');
  });

  it('基準日を「9/25 引け時点」にする', () => {
    expect(formatReferenceDate('2025-09-25')).toBe('9/25 引け時点');
    expect(formatReferenceDate('2025-01-05')).toBe('1/5 引け時点');
  });

  it('基準日がないか不正なら null を返す', () => {
    expect(formatReferenceDate(null)).toBeNull();
    expect(formatReferenceDate(undefined)).toBeNull();
    expect(formatReferenceDate('')).toBeNull();
    expect(formatReferenceDate('20250925')).toBeNull();
  });

  it('点灯数を内訳付きで表示する', () => {
    expect(formatLit({ total: 3, buy: 2, sell: 1 })).toBe('3（買2売1）');
    expect(formatLit({ total: 0, buy: 0, sell: 0 })).toBe('0');
    expect(formatLit(null)).toBe('—');
    expect(formatLit(undefined)).toBe('—');
  });
});

describe('同じ確率帯の過去実績', () => {
  it('1 行の文言にする', () => {
    expect(formatBandHistory({ lower: 0.55, upper: 0.6, count: 212, hitRate: 0.57 })).toBe(
      '55〜60% の帯の実績: 的中 57%（212 件）'
    );
  });

  it('件数が 30 未満なら参考値扱いにする', () => {
    expect(isBandLowSample({ lower: 0, upper: 1, count: 29, hitRate: 0.5 })).toBe(true);
    expect(isBandLowSample({ lower: 0, upper: 1, count: 30, hitRate: 0.5 })).toBe(false);
  });
});

describe('内訳', () => {
  it('点灯型は点灯／点灯なしを表示する', () => {
    expect(formatAxisValue(axis({ kind: 'FLAG', lit: true }))).toBe('点灯');
    expect(formatAxisValue(axis({ kind: 'FLAG', lit: false }))).toBe('点灯なし');
  });

  it('数値型は平常比を小数 1 桁で表示する', () => {
    expect(formatAxisValue(axis({ kind: 'NUMERIC', ratio: 1.42 }))).toBe('1.4 倍（平常比）');
    expect(formatAxisValue(axis({ kind: 'NUMERIC' }))).toBe('—');
  });

  it('過去成績を件数・的中率・基準差で表示する', () => {
    expect(formatAxisPerformance(axis({}))).toBe('100 件 / 的中 57% / ふだんとの差 +3.2pt');
  });

  it('点灯しなかった点灯型の軸だけを分け、順序を保つ', () => {
    const lit = axis({ axisId: 'lit', lit: true });
    const numeric = axis({ axisId: 'num', kind: 'NUMERIC', ratio: 1 });
    const off = axis({ axisId: 'off', lit: false });
    const unset = axis({ axisId: 'unset' });

    expect(splitAxes([lit, off, numeric, unset])).toEqual({
      active: [lit, numeric],
      inactive: [off, unset],
    });
  });
});

describe('確度なしの理由', () => {
  it('確度レコードがなければ確度なしの理由を返す', () => {
    expect(resolveUnavailableReason('DIR', null)).toBe('この日の確度はありません');
    expect(resolveUnavailableReason('VOL', null)).toBe('この日の確度はありません');
  });

  it('荒れだけ出せないときは履歴不足の理由を返す', () => {
    const forecast = { dir: null, vol: null, lit: { total: 0, buy: 0, sell: 0 } };
    expect(resolveUnavailableReason('VOL', forecast)).toBe('履歴が足りず算出できません');
    expect(resolveUnavailableReason('DIR', forecast)).toBe('この日の確度はありません');
  });
});

describe('その他', () => {
  it('詳細の問いを ProbabilityView に変換する', () => {
    const detail: QuestionDetail = {
      probability: 0.6,
      baseline: 0.5,
      lean: 'UP',
      neutralBand: { lower: 0.47, upper: 0.53 },
      bandHistory: null,
      axes: [],
    };
    expect(toProbabilityView(detail)).toEqual({ probability: 0.6, baseline: 0.5, lean: 'UP' });
    expect(toProbabilityView(null)).toBeNull();
    expect(toProbabilityView(undefined)).toBeNull();
  });

  it('成績画面のリンクを問いごとに組み立てる', () => {
    expect(buildAxisPerformanceHref('DIR')).toBe('/axis-performance?question=DIR');
    expect(buildAxisPerformanceHref('VOL')).toBe('/axis-performance?question=VOL');
  });
});

describe('resolveMarketNotes', () => {
  const view = (baseline: number, lowSample: boolean) => ({
    probability: 0.3,
    baseline,
    lean: 'NEUTRAL' as const,
    lowSample,
  });

  it('全市場でふだんの割合が同じで両方とも参考値なら、共通行に 1 回だけ出す', () => {
    expect(resolveMarketNotes([view(0.36, true), view(0.36, true)])).toEqual({
      sharedBaseline: 0.36,
      sharedLowSample: true,
      baselinePerRow: false,
      lowSamplePerRow: false,
    });
  });

  it('ふだんの割合が市場で違えば各行に出す', () => {
    const notes = resolveMarketNotes([view(0.36, false), view(0.4, false)]);
    expect(notes.sharedBaseline).toBeNull();
    expect(notes.baselinePerRow).toBe(true);
  });

  it('参考値が片方だけなら該当する行に出す', () => {
    const notes = resolveMarketNotes([view(0.36, true), view(0.36, false)]);
    expect(notes.sharedLowSample).toBe(false);
    expect(notes.lowSamplePerRow).toBe(true);
  });

  it('確度のある市場が 1 つだけでもその値を共通行に使う', () => {
    const notes = resolveMarketNotes([view(0.36, true), null]);
    expect(notes.sharedBaseline).toBe(0.36);
    expect(notes.sharedLowSample).toBe(true);
  });

  it('確度がなければ何も出さない', () => {
    expect(resolveMarketNotes([null, null])).toEqual({
      sharedBaseline: null,
      sharedLowSample: false,
      baselinePerRow: false,
      lowSamplePerRow: false,
    });
  });

  it('点灯数を合計と内訳に分ける', () => {
    expect(buildLitParts({ total: 1, buy: 0, sell: 1 })).toEqual({
      total: '1',
      breakdown: '（買0売1）',
    });
    expect(buildLitParts({ total: 0, buy: 0, sell: 0 })).toEqual({ total: '0', breakdown: null });
    expect(buildLitParts(null)).toEqual({ total: '—', breakdown: null });
  });

  it('ラベル枠の幅は最も長いラベルに合わせ、荒れが方向以上になる', () => {
    expect(resolveLabelSlotWidthRem('DIR')).toBeGreaterThan(0);
    expect(resolveLabelSlotWidthRem('VOL')).toBeGreaterThanOrEqual(resolveLabelSlotWidthRem('DIR'));
  });
});
