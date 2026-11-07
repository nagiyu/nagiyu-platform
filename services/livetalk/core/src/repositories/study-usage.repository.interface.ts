/**
 * 勉強 (Web リサーチ) の 1 日あたりの回数のリポジトリインターフェース。
 *
 * 利用者 × 日本時間の暦日で 1 アイテムを持ち、キャラクターごとの回数を属性で分けて数える。
 */

/** 回数アイテムの Type 属性値 */
export const STUDY_USAGE_ITEM_TYPE = 'StudyUsage';

export interface TryConsumeStudyUsageInput {
  userId: string;
  characterId: string;
  /** このキャラクターが 1 日に使える回数の上限 */
  limit: number;
  /** 日付の判定に使う現在時刻 (Unix ms) */
  nowMs: number;
}

export interface StudyUsageRepository {
  /**
   * 上限に達していなければ 1 回分を数える。判定と加算は不可分で、同時に呼ばれても上限を超えない。
   *
   * @returns 数えられたとき true、上限に達していたとき false
   * @throws 記録の読み書きに失敗したとき
   */
  tryConsume(input: TryConsumeStudyUsageInput): Promise<boolean>;
}
