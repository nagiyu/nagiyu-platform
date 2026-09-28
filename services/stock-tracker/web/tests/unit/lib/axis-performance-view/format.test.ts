import {
  buildAxisDescription,
  buildBandLabel,
  buildHeadline,
  buildNeutralBandText,
  buildRangeText,
  formatCount,
  formatPercent,
  formatSignedPercent,
  formatSignedPt,
  formatWeight,
} from '../../../../lib/axis-performance-view/format';

describe('format', () => {
  it('率を % にする', () => {
    expect(formatPercent(0.503)).toBe('50.3%');
    expect(formatPercent(0.5, 0)).toBe('50%');
  });

  it('符号付きの pt / % / 重みを作る', () => {
    expect(formatSignedPt(0.021)).toBe('+2.1pt');
    expect(formatSignedPt(-0.008)).toBe('−0.8pt');
    expect(formatSignedPt(0.00001)).toBe('+0.0pt');
    expect(formatSignedPercent(0.003)).toBe('+0.30%');
    expect(formatSignedPercent(-0.0125)).toBe('−1.25%');
    expect(formatWeight(0.4)).toBe('+0.40');
    expect(formatWeight(-1.234)).toBe('−1.23');
  });

  it('件数を桁区切りにする', () => {
    expect(formatCount(8120)).toBe('8,120');
  });

  it('見出し行を作る', () => {
    expect(buildHeadline({ evaluatedCount: 8120, hitRate: 0.503 })).toBe(
      '採点済み 8,120 件 ／ 基準 50.3%'
    );
  });

  it('予測日の範囲を作る。データなしは null', () => {
    expect(buildRangeText('2026-06-30', '2026-09-24')).toBe('2026-06-30〜2026-09-24 (予測日)');
    expect(buildRangeText(null, null)).toBeNull();
  });

  describe('buildNeutralBandText', () => {
    it('null は出さない', () => {
      expect(buildNeutralBandText(null)).toBeNull();
    });
    it('両側あり', () => {
      expect(buildNeutralBandText({ lower: 0, upper: 0.05 })).toBe('基準値 +0〜+5pt は中立');
      expect(buildNeutralBandText({ lower: -0.05, upper: 0.1 })).toBe('基準値 −5〜+10pt は中立');
    });
    it('下側の番兵値は下側なし', () => {
      expect(buildNeutralBandText({ lower: -1, upper: 0.05 })).toBe(
        '基準値 +5pt 未満は中立 (下側なし)'
      );
    });
    it('上側の番兵値は上側なし', () => {
      expect(buildNeutralBandText({ lower: 0, upper: 1 })).toBe(
        '基準値 +0pt 以上は中立 (上側なし)'
      );
    });
    it('両側とも番兵値', () => {
      expect(buildNeutralBandText({ lower: -1, upper: 1 })).toContain('下側なし・上側なし');
    });
  });

  it('確率帯の見出しを作る', () => {
    expect(buildBandLabel(0.45, 0.5)).toBe('45〜50%');
  });

  it('軸の説明を種類と問いから組み立てる', () => {
    expect(buildAxisDescription({ name: 'RSI 売られすぎ', kind: 'FLAG' }, 'DIR')).toBe(
      '「RSI 売られすぎ」が点灯した予測の的中率を集計します。対象の問い: 方向 (翌営業日に市場平均を上回るか)'
    );
    expect(buildAxisDescription({ name: '値幅', kind: 'NUMERIC' }, 'VOL')).toContain(
      '平常より高かった'
    );
  });
});
