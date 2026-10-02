/**
 * 問いごとの合成モデル（model.ts）の単体テスト。
 */
import {
  fitQuestionModel,
  predictProbability,
  standardizeForPrediction,
  type TrainingRow,
} from '../../../src/forecast/model.js';
import { logit } from '../../../src/forecast/stats.js';

describe('fitQuestionModel', () => {
  it('値がない軸を含む行は学習から除外する（notna().all）', () => {
    const rows: TrainingRow[] = [
      {
        values: { 'range-today': 0.1, 'volume-ratio': undefined },
        y: 1,
        offset: 0,
        date: '2026-01-01',
      },
      { values: { 'range-today': 0.2, 'volume-ratio': 0.1 }, y: 0, offset: 0, date: '2026-01-02' },
    ];
    const model = fitQuestionModel('VOL', ['range-today', 'volume-ratio'], rows);
    expect(model.trainingSize).toBe(1);
    expect(model.distinctTrainingDates).toBe(1);
  });

  it('学習サンプルが0件でも重み0のモデルを返す', () => {
    const model = fitQuestionModel('DIR', ['morning-star'], []);
    expect(model.trainingSize).toBe(0);
    expect(model.weights['morning-star']).toBe(0);
  });

  it('数値型軸は標準化パラメータを持つ。点灯型軸は持たない', () => {
    const rows: TrainingRow[] = [
      { values: { 'range-today': 0.1, 'morning-star': 1 }, y: 1, offset: 0, date: '2026-01-01' },
      { values: { 'range-today': 0.3, 'morning-star': 0 }, y: 0, offset: 0, date: '2026-01-02' },
    ];
    const model = fitQuestionModel('VOL', ['range-today', 'morning-star'], rows);
    expect(model.standardization['range-today']).toBeDefined();
    expect(model.standardization['morning-star']).toBeUndefined();
  });

  it('同じ日付が複数回出てきても distinctTrainingDates は重複しない', () => {
    const rows: TrainingRow[] = [
      { values: { a: 1 }, y: 1, offset: 0, date: '2026-01-01' },
      { values: { a: 0 }, y: 0, offset: 0, date: '2026-01-01' },
      { values: { a: 1 }, y: 1, offset: 0, date: '2026-01-02' },
    ];
    const model = fitQuestionModel('DIR', ['a'], rows);
    expect(model.trainingSize).toBe(3);
    expect(model.distinctTrainingDates).toBe(2);
  });
});

describe('standardizeForPrediction / predictProbability', () => {
  it('値なしの軸は標準化後0（寄与なし）として扱う', () => {
    const rows: TrainingRow[] = [
      { values: { 'range-today': 0.1 }, y: 1, offset: 0, date: '2026-01-01' },
      { values: { 'range-today': 0.3 }, y: 0, offset: 0, date: '2026-01-02' },
    ];
    const model = fitQuestionModel('VOL', ['range-today'], rows);
    const z = standardizeForPrediction(model, {});
    expect(z['range-today']).toBe(0);
  });

  it('predictProbability はオフセットのみのとき sigmoid(offset) に一致する', () => {
    const model = fitQuestionModel('DIR', ['morning-star'], []);
    const offset = logit(0.4);
    const p = predictProbability(model, offset, { 'morning-star': 1 });
    expect(p).toBeCloseTo(0.4, 8);
  });
});
