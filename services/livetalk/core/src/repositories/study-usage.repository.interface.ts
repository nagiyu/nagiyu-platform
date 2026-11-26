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
  /** 利用者の全キャラクター合計で 1 日に使える回数の上限 */
  totalLimit: number;
  /** 日付の判定に使う現在時刻 (Unix ms) */
  nowMs: number;
}

export interface ReadStudyUsageInput {
  userId: string;
  characterId: string;
  /** 日付の判定に使う現在時刻 (Unix ms) */
  nowMs: number;
}

/** その日に数えた勉強の回数。記録が無い属性は 0 */
export interface StudyUsageCounts {
  /** このキャラクターの回数 */
  characterCount: number;
  /** 利用者の全キャラクター合計の回数 */
  totalCount: number;
}

export interface StudyUsageRepository {
  /**
   * キャラクターの上限と利用者の合計の上限の両方に達していなければ 1 回分を数える。上限は超えないが、同時に呼ばれると実際より多く数えて断る側にずれることがある。
   *
   * @returns 数えられたとき true、上限に達していたとき false
   * @throws 記録の読み書きに失敗したとき
   */
  tryConsume(input: TryConsumeStudyUsageInput): Promise<boolean>;

  /**
   * その日 (日本時間の暦日) のキャラクター別と利用者合計の回数を読む。数えずに読むだけで、記録が無い日は 0 を返す。
   *
   * @throws 記録の読み取りに失敗したとき
   */
  readUsage(input: ReadStudyUsageInput): Promise<StudyUsageCounts>;
}
