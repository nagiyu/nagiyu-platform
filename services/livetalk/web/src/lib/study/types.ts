/**
 * 勉強の状態の表示用の形。API とクライアントで共有する。
 *
 * - `hidden`: 札を出さない (運営者・スタンダード、無料で Profile がまだない)
 * - `trial`: 無料でお試し中。`remainingDays` は残り時間を日に切り上げた値 (1 以上)
 * - `ended`: 無料でお試しが終わり、勉強が止まっている
 */
export type StudyStatus =
  { state: 'hidden' } | { state: 'trial'; remainingDays: number } | { state: 'ended' };
