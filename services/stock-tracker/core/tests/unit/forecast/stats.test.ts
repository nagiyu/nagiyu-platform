import {
  fitLogisticRegression,
  holmCorrection,
  logit,
  meanAndPopulationStd,
  sigmoid,
  solveLinearSystem,
  twoSidedBinomialTest,
} from '../../../src/forecast/stats.js';

describe('logit / sigmoid', () => {
  it('sigmoid(logit(p)) は p に戻る', () => {
    for (const p of [0.01, 0.1, 0.5, 0.7, 0.99]) {
      expect(sigmoid(logit(p))).toBeCloseTo(p, 6);
    }
  });

  it('0/1 付近はクリップされる', () => {
    expect(logit(0)).toBeCloseTo(logit(1e-6), 5);
    expect(logit(1)).toBeCloseTo(logit(1 - 1e-6), 5);
  });

  it('sigmoid(0) = 0.5', () => {
    expect(sigmoid(0)).toBe(0.5);
  });
});

describe('solveLinearSystem', () => {
  it('単位行列を解く', () => {
    const x = solveLinearSystem(
      [
        [1, 0],
        [0, 1],
      ],
      [3, 4]
    );
    expect(x).toEqual([3, 4]);
  });

  it('一般の対称正定値行列を解く', () => {
    // [[4,1],[1,3]] x = [1,2] => x = [1/11, 7/11]
    const x = solveLinearSystem(
      [
        [4, 1],
        [1, 3],
      ],
      [1, 2]
    );
    expect(x[0]).toBeCloseTo(1 / 11, 8);
    expect(x[1]).toBeCloseTo(7 / 11, 8);
  });

  it('対角成分が0でもピボット選択で行を入れ替えて解く', () => {
    const x = solveLinearSystem(
      [
        [0, 1],
        [1, 0],
      ],
      [2, 3]
    );
    expect(x[0]).toBeCloseTo(3, 8);
    expect(x[1]).toBeCloseTo(2, 8);
  });

  it('特異行列は例外を投げる', () => {
    expect(() =>
      solveLinearSystem(
        [
          [1, 1],
          [1, 1],
        ],
        [1, 2]
      )
    ).toThrow();
  });
});

describe('meanAndPopulationStd', () => {
  it('平均・母標準偏差(ddof=0)を返す', () => {
    const { mean, std } = meanAndPopulationStd([1, 2, 3, 4]);
    expect(mean).toBeCloseTo(2.5, 8);
    expect(std).toBeCloseTo(Math.sqrt(1.25), 8);
  });

  it('分散0は1に丸める', () => {
    const { std } = meanAndPopulationStd([5, 5, 5]);
    expect(std).toBe(1);
  });

  it('空配列は平均0・標準偏差1', () => {
    expect(meanAndPopulationStd([])).toEqual({ mean: 0, std: 1 });
  });
});

describe('fitLogisticRegression', () => {
  it('単純な分離可能データで、正の相関に正の重みがつく', () => {
    // x=1 のとき y=1 が多く、x=0 のとき y=0 が多いデータ
    const design = [[1], [1], [1], [0], [0], [0]];
    const y = [1, 1, 0, 0, 0, 1];
    const offset = new Array(6).fill(0);
    const beta = fitLogisticRegression({ design, y, offset, alpha: 1 });
    expect(beta[0]).toBeGreaterThan(0);
  });

  it('offset を大きくすると、確率も高く出る（回帰は 0 のまま動かない場合）', () => {
    const design = [[0], [0], [0], [0]];
    const y = [1, 0, 1, 0];
    const offset = [5, 5, 5, 5];
    const beta = fitLogisticRegression({ design, y, offset, alpha: 100 });
    // 特徴量が全て 0 のため beta はほぼ 0
    expect(beta[0]).toBeCloseTo(0, 6);
  });

  it('サンプルが 0 件なら 0 ベクトルを返す', () => {
    const beta = fitLogisticRegression({ design: [], y: [], offset: [], alpha: 10 });
    expect(beta).toEqual([]);
  });

  it('正則化を強めると重みが 0 に近づく', () => {
    const design = [[1], [1], [1], [0], [0], [0]];
    const y = [1, 1, 1, 0, 0, 0];
    const offset = new Array(6).fill(0);
    const weak = fitLogisticRegression({ design, y, offset, alpha: 1 });
    const strong = fitLogisticRegression({ design, y, offset, alpha: 1000 });
    expect(Math.abs(strong[0])).toBeLessThan(Math.abs(weak[0]));
  });
});

describe('twoSidedBinomialTest', () => {
  it('観測値が期待値どおりなら p 値は 1 に近い', () => {
    const p = twoSidedBinomialTest(50, 100, 0.5);
    expect(p).toBeGreaterThan(0.9);
  });

  it('観測値が極端なら p 値は小さい', () => {
    const p = twoSidedBinomialTest(90, 100, 0.5);
    expect(p).toBeLessThan(0.01);
  });

  it('scipy.stats.binomtest と同じ値になる(k=7,n=10,p=0.5 -> 0.34375)', () => {
    const p = twoSidedBinomialTest(7, 10, 0.5);
    expect(p).toBeCloseTo(0.34375, 5);
  });

  it('n=0 のとき 1 を返す', () => {
    expect(twoSidedBinomialTest(0, 0, 0.5)).toBe(1);
  });
});

describe('holmCorrection', () => {
  it('単調増加になる（小さい p 値ほど補正後も小さいか同じ）', () => {
    const adjusted = holmCorrection([0.01, 0.02, 0.5]);
    // Holm: m=3, ranks are 0.01(rank0)*3=0.03, 0.02(rank1)*2=0.04, 0.5(rank2)*1=0.5
    expect(adjusted[0]).toBeCloseTo(0.03, 8);
    expect(adjusted[1]).toBeCloseTo(0.04, 8);
    expect(adjusted[2]).toBeCloseTo(0.5, 8);
  });

  it('1 を超えない', () => {
    const adjusted = holmCorrection([0.9, 0.95, 0.99]);
    for (const a of adjusted) {
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('累積最大を取るため、順序が逆転しても単調性が保たれる', () => {
    // p 値: [0.5, 0.001] -> sorted: 0.001(rank0)*2=0.002, 0.5(rank1)*1=0.5
    const adjusted = holmCorrection([0.5, 0.001]);
    expect(adjusted[1]).toBeCloseTo(0.002, 8);
    expect(adjusted[0]).toBeCloseTo(0.5, 8);
  });
});
