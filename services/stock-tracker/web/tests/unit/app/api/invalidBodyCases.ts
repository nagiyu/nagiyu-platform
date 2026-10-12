/**
 * 不正なリクエストボディのうち、項目の中身を問わず弾かれるものの共通定義
 *
 * 各要素は [ケース名, リクエストボディの生文字列]。
 * JSON のパースまで含めて確認するため、オブジェクトではなく文字列で持つ。
 */
export const MALFORMED_BODY_CASES: ReadonlyArray<readonly [string, string]> = [
  ['壊れた JSON', '{"name":'],
  ['本文が null', 'null'],
  ['本文が配列', '[]'],
  ['本文が文字列', '"text"'],
];
