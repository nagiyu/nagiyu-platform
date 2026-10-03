/**
 * AdSense スクリプトを読み込むべきかを判定する。
 *
 * 'prod' と完全一致する場合のみ true を返す。
 * 未設定を prod 扱いにする認証設定とは逆に、広告は出し漏れより dev など複製環境への出力の方が
 * 審査上の害が大きいため、明示的に prod と指定された場合に限定する。
 *
 * @param nagiyuEnv - デプロイ先環境名 ('dev' | 'prod')。ビルド時に渡された値を想定する
 */
export function shouldLoadAdsense(nagiyuEnv: string | undefined): boolean {
  return nagiyuEnv === 'prod';
}
