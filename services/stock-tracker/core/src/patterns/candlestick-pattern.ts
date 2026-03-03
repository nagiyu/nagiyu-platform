import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';

/**
 * キャンドルスティックパターン 抽象基底クラス
 */
export abstract class CandlestickPattern {
  /** パターン定義（名称・説明・売買区分） */
  public abstract readonly definition: PatternDefinition;

  /**
   * パターン判定を実行する
   *
   * @param candles - 日足データ配列（新しい順: index 0 が最新）
   * @returns PatternStatus（MATCHED / NOT_MATCHED / INSUFFICIENT_DATA）
   */
  public abstract analyze(candles: ChartDataPoint[]): PatternStatus;
}
