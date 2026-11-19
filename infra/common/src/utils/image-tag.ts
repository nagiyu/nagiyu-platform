/** イメージタグを指定する環境変数名 */
const IMAGE_TAG_ENV_NAME = 'IMAGE_TAG';

/** 環境変数が無いときのタグ */
const DEFAULT_IMAGE_TAG = 'latest';

/**
 * Lambda のコンテナイメージのタグを返す。
 *
 * タグは 1 回のデプロイで全イメージ共通の値のため、関数ごとの props ではなく環境変数で受ける。
 * 環境変数が空のときは `latest` に落とす。`IMAGE_TAG` を渡さない既存のデプロイを、
 * 今までどおり `latest` のイメージで動かし続けるためである。
 */
export function getImageTag(): string {
  const tag = process.env[IMAGE_TAG_ENV_NAME];
  return tag ? tag : DEFAULT_IMAGE_TAG;
}
