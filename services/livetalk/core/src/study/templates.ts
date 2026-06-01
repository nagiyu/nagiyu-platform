/**
 * 「勉強しておくね」応答テンプレート（Phase 5b / Issue #3344）。
 *
 * 知識ゲートで「needsStudy=true」と判定されたトピックに対して
 * キャラ口調で返す固定テンプレート。LLM をバイパスして送出する。
 */

const STUDY_DEFERRAL_MESSAGES = [
  'ちょっとそこまでは知らないかも…。気になったから、ちゃんと勉強しておくね！次に話すときまでに調べてくる！',
  'うーん、それは私にはまだわからないな…。勉強しておくから、また今度教えてあげる！',
  'そこまでは把握してないかも…ごめんね。次までにちゃんと調べておくよ！',
];

/**
 * 「勉強しておくね」テンプレートメッセージを返す。
 * 現在時刻のミリ秒で選択する（テスト時は nowMs=0 で 0 番目）。
 */
export function buildStudyDeferralMessage(nowMs?: number): string {
  const idx = nowMs !== undefined ? nowMs % STUDY_DEFERRAL_MESSAGES.length : 0;
  return STUDY_DEFERRAL_MESSAGES[idx];
}
