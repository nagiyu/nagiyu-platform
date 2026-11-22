/** イメージタグを指定する環境変数名 */
const IMAGE_TAG_ENV_NAME = 'IMAGE_TAG';

export const IMAGE_TAG_ERROR_MESSAGES = {
  IMAGE_TAG_REQUIRED:
    '環境変数 IMAGE_TAG が設定されていません。ECR に push 済みのイメージのタグを IMAGE_TAG に渡してください',
} as const;

/**
 * コンテナイメージのタグを返す。
 *
 * タグは 1 回のデプロイで全イメージ共通の値のため、関数ごとの props ではなく環境変数で受ける。
 * 無指定のまま既定のタグへ落とすと、渡し忘れたデプロイが古いイメージへ黙って戻ってしまう。
 * そのため、環境変数が無い、または空のときは例外を投げる。
 *
 * @throws 環境変数 `IMAGE_TAG` が無い、または空のとき
 */
export function getImageTag(): string {
  const tag = process.env[IMAGE_TAG_ENV_NAME];
  if (!tag) {
    throw new Error(IMAGE_TAG_ERROR_MESSAGES.IMAGE_TAG_REQUIRED);
  }
  return tag;
}
