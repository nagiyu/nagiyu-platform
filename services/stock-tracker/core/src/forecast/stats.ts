/**
 * Stock Tracker Core - Forecast 統計ユーティリティ
 *
 * L2 正則化ロジスティック回帰（IRLS/ニュートン法）、logit/sigmoid、両側二項検定、Holm 補正。
 * 乱数は使わない（NFR-3）。参照実装 analysis/wf.py の LR クラス・decision2.py の二項検定と同じ定義。
 */
import {
  FORECAST_ERROR_MESSAGES,
  IRLS_MAX_ITERATIONS,
  IRLS_STEP_TOLERANCE,
  LOGIT_EPSILON,
} from './constants.js';

/** [epsilon, 1-epsilon] にクリップする */
function clip(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** logit(p) = log(p / (1-p))。p は [LOGIT_EPSILON, 1-LOGIT_EPSILON] にクリップする。 */
export function logit(p: number): number {
  const clipped = clip(p, LOGIT_EPSILON, 1 - LOGIT_EPSILON);
  return Math.log(clipped / (1 - clipped));
}

/** シグモイド関数 */
export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * n x n の対称正定値行列 A に対し Ax = b を解く（ガウスの消去法、部分ピボット選択）。
 * IRLS のヘッセ行列は L2 正則化により正定値になるため、この実装で十分。
 */
export function solveLinearSystem(
  matrix: readonly (readonly number[])[],
  vector: readonly number[]
): number[] {
  const n = vector.length;
  // 拡大係数行列を作る（破壊的変更を避けるためコピー）
  const a: number[][] = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col++) {
    // 部分ピボット選択
    let pivotRow = col;
    let pivotValue = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > pivotValue) {
        pivotValue = Math.abs(a[row][col]);
        pivotRow = row;
      }
    }
    if (pivotValue < 1e-300) {
      throw new Error(FORECAST_ERROR_MESSAGES.SINGULAR_MATRIX);
    }
    if (pivotRow !== col) {
      const tmp = a[col];
      a[col] = a[pivotRow];
      a[pivotRow] = tmp;
    }
    const pivot = a[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / pivot;
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) {
        a[row][k] -= factor * a[col][k];
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = a[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= a[row][col] * x[col];
    }
    x[row] = sum / a[row][row];
  }
  return x;
}

export interface LogisticRegressionInput {
  /** 学習サンプル × 軸 の設計行列（標準化済み数値軸 + 点灯型 0/1。切片列は含めない） */
  design: readonly (readonly number[])[];
  /** 目的変数（0/1） */
  y: readonly number[];
  /** オフセット（基準値の logit）。サンプルごとに与える */
  offset: readonly number[];
  /** L2 正則化係数（全軸共通。design.md §1.4） */
  alpha: number;
}

/**
 * L2 正則化ロジスティック回帰（切片なし・オフセット付き）を IRLS（ニュートン法）で解く。
 *
 * 損失 = Σ[-y log(sigmoid(offset+Xβ)) - (1-y) log(1-sigmoid(offset+Xβ))] + (alpha/2)‖β‖²
 * 初期値 0、最大 IRLS_MAX_ITERATIONS 回、max|step| < IRLS_STEP_TOLERANCE で終了。
 * 乱数は使わない（NFR-3・design.md §1.4 参照実装 wf.py LR クラスの fit_intercept=False 相当）。
 */
export function fitLogisticRegression(input: LogisticRegressionInput): number[] {
  const { design, y, offset, alpha } = input;
  const n = design.length;
  const p = n > 0 ? design[0].length : 0;
  const beta = new Array<number>(p).fill(0);
  if (p === 0) {
    return beta;
  }

  for (let iter = 0; iter < IRLS_MAX_ITERATIONS; iter++) {
    const eta = new Array<number>(n);
    const mu = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let e = offset[i];
      const row = design[i];
      for (let j = 0; j < p; j++) {
        e += row[j] * beta[j];
      }
      eta[i] = e;
      mu[i] = sigmoid(e);
    }

    // 勾配 g = X^T (mu - y) + alpha * beta
    const gradient = new Array<number>(p).fill(0);
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += design[i][j] * (mu[i] - y[i]);
      }
      gradient[j] = sum + alpha * beta[j];
    }

    // ヘッセ行列 H = X^T W X + alpha*I（W = diag(mu*(1-mu))）
    const hessian: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    for (let i = 0; i < n; i++) {
      const w = mu[i] * (1 - mu[i]);
      if (w === 0) continue;
      const row = design[i];
      for (let j = 0; j < p; j++) {
        const wj = w * row[j];
        if (wj === 0) continue;
        for (let k = j; k < p; k++) {
          hessian[j][k] += wj * row[k];
        }
      }
    }
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < j; k++) {
        hessian[j][k] = hessian[k][j];
      }
      hessian[j][j] += alpha;
    }

    const step = solveLinearSystem(hessian, gradient);
    let maxStep = 0;
    for (let j = 0; j < p; j++) {
      beta[j] -= step[j];
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    if (maxStep < IRLS_STEP_TOLERANCE) {
      break;
    }
  }

  return beta;
}

/**
 * 標本平均・母標準偏差（ddof=0）を返す。0 なら 1 に丸める（design.md §1.4）。
 */
export function meanAndPopulationStd(values: readonly number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, std: 1 };
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  return { mean, std: std === 0 ? 1 : std };
}

/**
 * 二項分布の確率質量関数 P(X = k) for X ~ Binomial(n, p)。
 */
function binomialPmf(k: number, n: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  const logCoefficient = logChoose(n, k);
  const logProb = logCoefficient + k * Math.log(p) + (n - k) * Math.log(1 - p);
  return Math.exp(logProb);
}

function logChoose(n: number, k: number): number {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function logFactorial(n: number): number {
  let sum = 0;
  for (let i = 2; i <= n; i++) {
    sum += Math.log(i);
  }
  return sum;
}

/**
 * 両側二項検定の p 値（scipy.stats.binomtest の two-sided と同じ定義）。
 *
 * 定義: 観測値 k の確率質量 × (1 + 1e-7) 以下となる全ての点の確率質量の総和。
 */
export function twoSidedBinomialTest(k: number, n: number, p: number): number {
  if (n === 0) return 1;
  const observedPmf = binomialPmf(k, n, p);
  const threshold = observedPmf * (1 + 1e-7);
  let total = 0;
  for (let x = 0; x <= n; x++) {
    const pmf = binomialPmf(x, n, p);
    if (pmf <= threshold) {
      total += pmf;
    }
  }
  return Math.min(1, total);
}

/**
 * Holm 法による多重比較補正。p 値の配列を受け取り、補正後の p 値（採択順の element-wise）を返す。
 */
export function holmCorrection(pValues: readonly number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const adjustedByRank = new Array<number>(m);
  let runningMax = 0;
  for (let rank = 0; rank < m; rank++) {
    const candidate = Math.min(1, pValues[order[rank].index] * (m - rank));
    runningMax = Math.max(runningMax, candidate);
    adjustedByRank[rank] = runningMax;
  }
  const result = new Array<number>(m);
  for (let rank = 0; rank < m; rank++) {
    result[order[rank].index] = adjustedByRank[rank];
  }
  return result;
}
