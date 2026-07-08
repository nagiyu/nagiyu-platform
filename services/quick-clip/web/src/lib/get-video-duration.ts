// 動画ファイルの再生時間(秒)を取得するヘルパー。
// off-DOM の <video> 要素にファイルを読み込ませ、loadedmetadata イベントから duration を取得する。
// UI コンポーネント(page.tsx 等)からブラウザ API の詳細を分離するために切り出している。
//
// 取得に失敗した場合(読み込みエラー・NaN・Infinity・タイムアウト)は
// 安全側フォールバックとして undefined を返す(呼び出し側はサイズ軸のみで Job Definition を選択する)。

const DEFAULT_TIMEOUT_MS = 5000;

export async function getVideoDurationSec(
  file: File,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const cleanup = (): void => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
      URL.revokeObjectURL(objectUrl);
      clearTimeout(timeoutId);
    };

    const finish = (result: number | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const onLoadedMetadata = (): void => {
      const { duration } = video;
      if (Number.isFinite(duration) && duration > 0) {
        finish(duration);
      } else {
        finish(undefined);
      }
    };

    const onError = (): void => {
      finish(undefined);
    };

    const timeoutId = setTimeout(() => finish(undefined), timeoutMs);

    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onError);
    video.src = objectUrl;
  });
}
