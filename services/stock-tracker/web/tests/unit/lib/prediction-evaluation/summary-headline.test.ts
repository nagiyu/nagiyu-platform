import {
  buildLoadingHeadline,
  buildSummaryHeadline,
  formatAccuracy,
  formatJudgedCount,
} from '../../../../lib/prediction-evaluation/summary-headline';
import type { KpiSummary } from '../../../../lib/prediction-evaluation/types';

describe('formatAccuracy', () => {
  it('数値を小数 1 桁の % 表記に整形する', () => {
    expect(formatAccuracy(63.5)).toBe('63.5%');
    expect(formatAccuracy(0)).toBe('0.0%');
  });

  it('null / NaN は "—" を返す', () => {
    expect(formatAccuracy(null)).toBe('—');
    expect(formatAccuracy(NaN)).toBe('—');
  });
});

describe('formatJudgedCount', () => {
  it('千の位区切りで整形する', () => {
    expect(formatJudgedCount(54)).toBe('54');
    expect(formatJudgedCount(1234)).toBe('1,234');
  });
});

describe('buildSummaryHeadline', () => {
  const baseKpi: KpiSummary = {
    totalAccuracy: 64.8,
    directionalAccuracy: 63.5,
    judgedCount: 54,
  };

  it('期間ラベル・方向精度・件数・総合精度を含むテキストを返す', () => {
    expect(buildSummaryHeadline('7d', baseKpi)).toBe(
      '直近 7 日の方向精度: 63.5%（採点 54 件、総合精度 64.8%）'
    );
  });

  it('全期間も同じフォーマットで返す', () => {
    expect(buildSummaryHeadline('all', baseKpi)).toBe(
      '全期間の方向精度: 63.5%（採点 54 件、総合精度 64.8%）'
    );
  });

  it('判定済み 0 件のときは「採点済みの予測がありません」を返す', () => {
    const emptyKpi: KpiSummary = {
      totalAccuracy: null,
      directionalAccuracy: null,
      judgedCount: 0,
    };
    expect(buildSummaryHeadline('all', emptyKpi)).toBe('全期間: 採点済みの予測がありません');
  });

  it('精度が null の場合は "—" として表示する', () => {
    const partialKpi: KpiSummary = {
      totalAccuracy: null,
      directionalAccuracy: null,
      judgedCount: 3,
    };
    expect(buildSummaryHeadline('7d', partialKpi)).toBe(
      '直近 7 日の方向精度: —（採点 3 件、総合精度 —）'
    );
  });
});

describe('buildLoadingHeadline', () => {
  it('期間ラベルと「集計中...」を返す', () => {
    expect(buildLoadingHeadline('30d')).toBe('直近 30 日: 集計中...');
  });
});
