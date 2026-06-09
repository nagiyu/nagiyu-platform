/**
 * Stock Tracker Core - Prediction Judger Service Unit Tests
 *
 * 採点判定ロジックのユニットテスト。シグナル × 境界値の網羅
 * （境界値ちょうど + 内側 + 外側）と入力バリデーションをカバーする。
 * `classifyHit` の独立テストも含む。
 */

import {
  judgePrediction,
  classifyHit,
  deriveSignalFromReturn,
  PREDICTION_SIGNAL_THRESHOLD_PERCENT,
  PREDICTION_JUDGER_ERROR_MESSAGES,
  type JudgeInput,
} from '../../../src/services/prediction-judger.js';

describe('PREDICTION_SIGNAL_THRESHOLD_PERCENT - 共有閾値定数', () => {
  it('0.5 であること', () => {
    expect(PREDICTION_SIGNAL_THRESHOLD_PERCENT).toBe(0.5);
  });
});

describe('deriveSignalFromReturn - 予測リターンからシグナルを導出', () => {
  describe('BULLISH（predictedReturn >= +threshold）', () => {
    it('predictedReturn が threshold ちょうど (+0.5%) なら BULLISH', () => {
      expect(deriveSignalFromReturn(0.5, 0.5)).toBe('BULLISH');
    });

    it('predictedReturn が threshold より大きければ BULLISH', () => {
      expect(deriveSignalFromReturn(0.51, 0.5)).toBe('BULLISH');
    });

    it('predictedReturn が極大値でも BULLISH', () => {
      expect(deriveSignalFromReturn(100, 0.5)).toBe('BULLISH');
    });
  });

  describe('BEARISH（predictedReturn <= -threshold）', () => {
    it('predictedReturn が -threshold ちょうど (-0.5%) なら BEARISH', () => {
      expect(deriveSignalFromReturn(-0.5, 0.5)).toBe('BEARISH');
    });

    it('predictedReturn が -threshold より小さければ BEARISH', () => {
      expect(deriveSignalFromReturn(-0.51, 0.5)).toBe('BEARISH');
    });

    it('predictedReturn が極小値でも BEARISH', () => {
      expect(deriveSignalFromReturn(-100, 0.5)).toBe('BEARISH');
    });
  });

  describe('NEUTRAL（-threshold < predictedReturn < +threshold）', () => {
    it('predictedReturn = 0 なら NEUTRAL', () => {
      expect(deriveSignalFromReturn(0, 0.5)).toBe('NEUTRAL');
    });

    it('predictedReturn が正の境界値の内側 (+0.49%) なら NEUTRAL', () => {
      expect(deriveSignalFromReturn(0.49, 0.5)).toBe('NEUTRAL');
    });

    it('predictedReturn が負の境界値の内側 (-0.49%) なら NEUTRAL', () => {
      expect(deriveSignalFromReturn(-0.49, 0.5)).toBe('NEUTRAL');
    });

    it('threshold = 1.0 のとき predictedReturn = 0.5 なら NEUTRAL', () => {
      expect(deriveSignalFromReturn(0.5, 1.0)).toBe('NEUTRAL');
    });
  });

  describe('異なる閾値', () => {
    it('threshold = 1.0 のとき predictedReturn = 1.0 なら BULLISH', () => {
      expect(deriveSignalFromReturn(1.0, 1.0)).toBe('BULLISH');
    });

    it('threshold = 1.0 のとき predictedReturn = -1.0 なら BEARISH', () => {
      expect(deriveSignalFromReturn(-1.0, 1.0)).toBe('BEARISH');
    });

    it('threshold = 0.1 のとき predictedReturn = 0.05 なら NEUTRAL', () => {
      expect(deriveSignalFromReturn(0.05, 0.1)).toBe('NEUTRAL');
    });
  });

  describe('入力バリデーション', () => {
    describe('thresholdPercent が不正な場合は INVALID_THRESHOLD エラー', () => {
      it.each([0, -0.5, NaN, Infinity, -Infinity])(
        '不正値 (%p) は INVALID_THRESHOLD エラー',
        (value) => {
          expect(() => deriveSignalFromReturn(1.0, value as number)).toThrow(
            PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_THRESHOLD
          );
        }
      );

      it('文字列型の thresholdPercent は INVALID_THRESHOLD エラー', () => {
        expect(() => deriveSignalFromReturn(1.0, '0.5' as unknown as number)).toThrow(
          PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_THRESHOLD
        );
      });
    });

    describe('predictedReturn が不正な場合は INVALID_PREDICTED_RETURN エラー', () => {
      it.each([NaN, Infinity, -Infinity])(
        '不正値 (%p) は INVALID_PREDICTED_RETURN エラー',
        (value) => {
          expect(() => deriveSignalFromReturn(value as number, 0.5)).toThrow(
            PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_PREDICTED_RETURN
          );
        }
      );

      it('文字列型の predictedReturn は INVALID_PREDICTED_RETURN エラー', () => {
        expect(() => deriveSignalFromReturn('1.0' as unknown as number, 0.5)).toThrow(
          PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_PREDICTED_RETURN
        );
      });
    });
  });
});

describe('classifyHit - 純粋 Hit 判定関数', () => {
  describe('BULLISH（境界値: >= +threshold）', () => {
    it('actualReturn が threshold ちょうどなら Hit', () => {
      expect(classifyHit('BULLISH', 0.5, 0.5)).toBe(true);
    });

    it('actualReturn が threshold より大きければ Hit', () => {
      expect(classifyHit('BULLISH', 0.51, 0.5)).toBe(true);
    });

    it('actualReturn が threshold 未満なら Miss', () => {
      expect(classifyHit('BULLISH', 0.49, 0.5)).toBe(false);
    });

    it('threshold = 1.0 のとき actualReturn = 1.0 なら Hit', () => {
      expect(classifyHit('BULLISH', 1.0, 1.0)).toBe(true);
    });

    it('threshold = 1.0 のとき actualReturn = 0.99 なら Miss', () => {
      expect(classifyHit('BULLISH', 0.99, 1.0)).toBe(false);
    });

    it('actualReturn = 0 なら Miss', () => {
      expect(classifyHit('BULLISH', 0, 0.5)).toBe(false);
    });

    it('actualReturn が負なら Miss', () => {
      expect(classifyHit('BULLISH', -0.5, 0.5)).toBe(false);
    });
  });

  describe('BEARISH（境界値: <= -threshold）', () => {
    it('actualReturn が -threshold ちょうどなら Hit', () => {
      expect(classifyHit('BEARISH', -0.5, 0.5)).toBe(true);
    });

    it('actualReturn が -threshold より小さければ Hit', () => {
      expect(classifyHit('BEARISH', -0.51, 0.5)).toBe(true);
    });

    it('actualReturn が -threshold より大きければ Miss', () => {
      expect(classifyHit('BEARISH', -0.49, 0.5)).toBe(false);
    });

    it('threshold = 1.0 のとき actualReturn = -1.0 なら Hit', () => {
      expect(classifyHit('BEARISH', -1.0, 1.0)).toBe(true);
    });

    it('threshold = 1.0 のとき actualReturn = -0.99 なら Miss', () => {
      expect(classifyHit('BEARISH', -0.99, 1.0)).toBe(false);
    });

    it('actualReturn = 0 なら Miss', () => {
      expect(classifyHit('BEARISH', 0, 0.5)).toBe(false);
    });

    it('actualReturn が正なら Miss', () => {
      expect(classifyHit('BEARISH', 0.5, 0.5)).toBe(false);
    });
  });

  describe('NEUTRAL（境界値: -threshold < r < +threshold）', () => {
    it('actualReturn = 0 なら Hit', () => {
      expect(classifyHit('NEUTRAL', 0, 0.5)).toBe(true);
    });

    it('actualReturn が正の境界値の内側なら Hit', () => {
      expect(classifyHit('NEUTRAL', 0.49, 0.5)).toBe(true);
    });

    it('actualReturn が負の境界値の内側なら Hit', () => {
      expect(classifyHit('NEUTRAL', -0.49, 0.5)).toBe(true);
    });

    it('actualReturn が +threshold ちょうどなら Miss（境界値は方向側）', () => {
      expect(classifyHit('NEUTRAL', 0.5, 0.5)).toBe(false);
    });

    it('actualReturn が -threshold ちょうどなら Miss（境界値は方向側）', () => {
      expect(classifyHit('NEUTRAL', -0.5, 0.5)).toBe(false);
    });

    it('actualReturn が threshold より大きければ Miss', () => {
      expect(classifyHit('NEUTRAL', 0.51, 0.5)).toBe(false);
    });

    it('actualReturn が -threshold より小さければ Miss', () => {
      expect(classifyHit('NEUTRAL', -0.51, 0.5)).toBe(false);
    });

    it('threshold = 1.0 のとき actualReturn = 0.5 なら Hit', () => {
      expect(classifyHit('NEUTRAL', 0.5, 1.0)).toBe(true);
    });

    it('threshold = 1.0 のとき actualReturn = 1.0 なら Miss', () => {
      expect(classifyHit('NEUTRAL', 1.0, 1.0)).toBe(false);
    });
  });

  describe('不正シグナル', () => {
    it('未知のシグナル値は INVALID_SIGNAL エラー', () => {
      expect(() => classifyHit('UNKNOWN' as 'BULLISH', 0, 0.5)).toThrow(
        PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_SIGNAL
      );
    });
  });
});

describe('Prediction Judger Service', () => {
  /**
   * 任意のリターン率になるよう `evaluationClose` を逆算するヘルパ。
   * baseClose = 100 のとき：
   *   evaluationClose = 100 + returnPercent
   */
  const buildInput = (
    signal: JudgeInput['signal'],
    returnPercent: number,
    thresholdPercent = 0.5
  ): JudgeInput => ({
    signal,
    baseClose: 100,
    evaluationClose: 100 + returnPercent,
    thresholdPercent,
  });

  describe('judgePrediction - actualReturn 計算', () => {
    it('終値が上昇した場合、正のリターンを返す', () => {
      const result = judgePrediction({
        signal: 'BULLISH',
        baseClose: 100,
        evaluationClose: 105,
        thresholdPercent: 0.5,
      });
      expect(result.actualReturn).toBeCloseTo(5, 10);
    });

    it('終値が下落した場合、負のリターンを返す', () => {
      const result = judgePrediction({
        signal: 'BEARISH',
        baseClose: 100,
        evaluationClose: 95,
        thresholdPercent: 0.5,
      });
      expect(result.actualReturn).toBeCloseTo(-5, 10);
    });

    it('終値変動なしの場合、0 を返す', () => {
      const result = judgePrediction({
        signal: 'NEUTRAL',
        baseClose: 200,
        evaluationClose: 200,
        thresholdPercent: 0.5,
      });
      expect(result.actualReturn).toBe(0);
    });

    it('小数の終値でも正しく算出する', () => {
      const result = judgePrediction({
        signal: 'BULLISH',
        baseClose: 250.5,
        evaluationClose: 252.0,
        thresholdPercent: 0.5,
      });
      // (252.0 - 250.5) / 250.5 * 100 ≈ 0.5988...
      expect(result.actualReturn).toBeCloseTo(0.5988, 3);
    });
  });

  describe('judgePrediction - BULLISH（境界値: >= +threshold）', () => {
    it('リターンが閾値ちょうど (+0.5%) なら Hit', () => {
      const result = judgePrediction(buildInput('BULLISH', 0.5));
      expect(result.hit).toBe(true);
    });

    it('リターンが閾値より大きい (+1.0%) なら Hit', () => {
      const result = judgePrediction(buildInput('BULLISH', 1.0));
      expect(result.hit).toBe(true);
    });

    it('リターンが閾値未満 (+0.4%) なら Miss', () => {
      const result = judgePrediction(buildInput('BULLISH', 0.4));
      expect(result.hit).toBe(false);
    });

    it('リターンが負 (-0.5%) なら Miss', () => {
      const result = judgePrediction(buildInput('BULLISH', -0.5));
      expect(result.hit).toBe(false);
    });

    it('リターンが 0 なら Miss', () => {
      const result = judgePrediction(buildInput('BULLISH', 0));
      expect(result.hit).toBe(false);
    });
  });

  describe('judgePrediction - BEARISH（境界値: <= -threshold）', () => {
    it('リターンが負の閾値ちょうど (-0.5%) なら Hit', () => {
      const result = judgePrediction(buildInput('BEARISH', -0.5));
      expect(result.hit).toBe(true);
    });

    it('リターンが負の閾値より小さい (-1.0%) なら Hit', () => {
      const result = judgePrediction(buildInput('BEARISH', -1.0));
      expect(result.hit).toBe(true);
    });

    it('リターンが負の閾値より大きい (-0.4%) なら Miss', () => {
      const result = judgePrediction(buildInput('BEARISH', -0.4));
      expect(result.hit).toBe(false);
    });

    it('リターンが正 (+0.5%) なら Miss', () => {
      const result = judgePrediction(buildInput('BEARISH', 0.5));
      expect(result.hit).toBe(false);
    });

    it('リターンが 0 なら Miss', () => {
      const result = judgePrediction(buildInput('BEARISH', 0));
      expect(result.hit).toBe(false);
    });
  });

  describe('judgePrediction - NEUTRAL（境界値: -threshold < r < +threshold）', () => {
    it('リターンが 0 なら Hit', () => {
      const result = judgePrediction(buildInput('NEUTRAL', 0));
      expect(result.hit).toBe(true);
    });

    it('リターンが正の閾値の内側 (+0.4%) なら Hit', () => {
      const result = judgePrediction(buildInput('NEUTRAL', 0.4));
      expect(result.hit).toBe(true);
    });

    it('リターンが負の閾値の内側 (-0.4%) なら Hit', () => {
      const result = judgePrediction(buildInput('NEUTRAL', -0.4));
      expect(result.hit).toBe(true);
    });

    it('リターンが正の閾値ちょうど (+0.5%) なら Miss（境界値は方向側）', () => {
      const result = judgePrediction(buildInput('NEUTRAL', 0.5));
      expect(result.hit).toBe(false);
    });

    it('リターンが負の閾値ちょうど (-0.5%) なら Miss（境界値は方向側）', () => {
      const result = judgePrediction(buildInput('NEUTRAL', -0.5));
      expect(result.hit).toBe(false);
    });

    it('リターンが正の閾値より大きい (+1.0%) なら Miss', () => {
      const result = judgePrediction(buildInput('NEUTRAL', 1.0));
      expect(result.hit).toBe(false);
    });

    it('リターンが負の閾値より小さい (-1.0%) なら Miss', () => {
      const result = judgePrediction(buildInput('NEUTRAL', -1.0));
      expect(result.hit).toBe(false);
    });
  });

  describe('judgePrediction - 異なる閾値', () => {
    it('thresholdPercent = 1.0 のとき、BULLISH かつリターン +1.0% なら Hit', () => {
      const result = judgePrediction(buildInput('BULLISH', 1.0, 1.0));
      expect(result.hit).toBe(true);
    });

    it('thresholdPercent = 1.0 のとき、BULLISH かつリターン +0.9% なら Miss', () => {
      const result = judgePrediction(buildInput('BULLISH', 0.9, 1.0));
      expect(result.hit).toBe(false);
    });

    it('thresholdPercent = 0.1 のとき、NEUTRAL かつリターン +0.05% なら Hit', () => {
      const result = judgePrediction(buildInput('NEUTRAL', 0.05, 0.1));
      expect(result.hit).toBe(true);
    });
  });

  describe('judgePrediction - 入力バリデーション', () => {
    const validBase = {
      signal: 'BULLISH' as const,
      baseClose: 100,
      evaluationClose: 101,
      thresholdPercent: 0.5,
    };

    describe('baseClose', () => {
      it.each([0, -1, NaN, Infinity, -Infinity])(
        '不正値 (%p) は INVALID_BASE_CLOSE エラー',
        (value) => {
          expect(() => judgePrediction({ ...validBase, baseClose: value as number })).toThrow(
            PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_BASE_CLOSE
          );
        }
      );

      it('文字列型の baseClose は INVALID_BASE_CLOSE エラー', () => {
        expect(() =>
          judgePrediction({ ...validBase, baseClose: '100' as unknown as number })
        ).toThrow(PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_BASE_CLOSE);
      });
    });

    describe('evaluationClose', () => {
      it.each([0, -1, NaN, Infinity, -Infinity])(
        '不正値 (%p) は INVALID_EVALUATION_CLOSE エラー',
        (value) => {
          expect(() => judgePrediction({ ...validBase, evaluationClose: value as number })).toThrow(
            PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_EVALUATION_CLOSE
          );
        }
      );

      it('文字列型の evaluationClose は INVALID_EVALUATION_CLOSE エラー', () => {
        expect(() =>
          judgePrediction({
            ...validBase,
            evaluationClose: '100' as unknown as number,
          })
        ).toThrow(PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_EVALUATION_CLOSE);
      });
    });

    describe('thresholdPercent', () => {
      it.each([0, -0.5, NaN, Infinity, -Infinity])(
        '不正値 (%p) は INVALID_THRESHOLD エラー',
        (value) => {
          expect(() =>
            judgePrediction({ ...validBase, thresholdPercent: value as number })
          ).toThrow(PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_THRESHOLD);
        }
      );
    });

    describe('signal', () => {
      it('未知のシグナル値は INVALID_SIGNAL エラー', () => {
        expect(() =>
          judgePrediction({
            ...validBase,
            signal: 'UNKNOWN' as unknown as 'BULLISH',
          })
        ).toThrow(PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_SIGNAL);
      });
    });
  });
});
