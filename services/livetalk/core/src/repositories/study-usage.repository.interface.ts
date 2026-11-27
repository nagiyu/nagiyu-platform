/**
 * 勉強 (Web リサーチ) の 1 日あたりの回数のリポジトリインターフェース。
 *
 * 利用者 × 日本時間の暦日で 1 アイテムを持ち、キャラクターごとの回数を属性で分けて数える。
 * 全利用者の合計は、日ごとに 1 つの別のアイテムで数える。
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
  /** 全利用者の合計で 1 日に使える回数の上限 */
  globalLimit: number;
  /** 日付の判定に使う現在時刻 (Unix ms) */
  nowMs: number;
}

/** 回数の上限で断った枠。狭い順 (キャラクター別 → 利用者の合計 → 全利用者の合計) */
export type StudyUsageDeniedScope = 'character' | 'user' | 'global';

/**
 * 回数を数えた結果。断られたときは、どの枠で断られたかを持つ。
 * 全利用者の合計の枠で断られた場合は、利用者ごとの上限とは別に運営が把握する必要があるため、区別して返す。
 */
export type TryConsumeStudyUsageResult =
  { ok: true } | { ok: false; deniedBy: StudyUsageDeniedScope };

export interface StudyUsageRepository {
  /**
   * キャラクターの上限・利用者の合計の上限・全利用者の合計の上限のすべてに達していなければ 1 回分を数える。上限は超えないが、同時に呼ばれると実際より多く数えて断る側にずれることがある。
   *
   * @returns 数えられたとき `{ ok: true }`、上限に達していたとき `{ ok: false, deniedBy }`
   * @throws 記録の読み書きに失敗したとき
   */
  tryConsume(input: TryConsumeStudyUsageInput): Promise<TryConsumeStudyUsageResult>;
}
