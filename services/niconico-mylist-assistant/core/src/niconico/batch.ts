import { reportErrorEvent } from '@nagiyu/aws';
import { toErrorMessage } from '@nagiyu/common';
import { getVideoInfo, NiconicoAPIError, NiconicoVideoInfo } from './client.js';
import { DEFAULT_BATCH_CONCURRENCY } from './constants.js';

export interface VideoInfoBatchResult {
  success: NiconicoVideoInfo[];
  failed: Array<{ videoId: string; error: string }>;
}

export async function getVideoInfoBatch(
  videoIds: string[],
  options?: {
    concurrency?: number;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<VideoInfoBatchResult> {
  const concurrency = options?.concurrency || DEFAULT_BATCH_CONCURRENCY;
  const success: NiconicoVideoInfo[] = [];
  const failed: Array<{ videoId: string; error: string }> = [];

  // 並列数を制限しながら取得する。
  // N 件ずつ区切って全件の完了を待ってから次へ進めるのは、空いたらすぐ次を始める方式
  // (共通の runWithConcurrency) だとニコニコ動画への時間あたりのリクエスト数が増えるため。
  // 区切りごとの待ちがリクエスト間隔を空ける役割を持つので、共通ヘルパーには置き換えない。
  for (let i = 0; i < videoIds.length; i += concurrency) {
    const batch = videoIds.slice(i, i + concurrency);
    const promises = batch.map(async (videoId) => {
      try {
        const info = await getVideoInfo(videoId);
        success.push(info);
      } catch (error) {
        // 失敗を failed に集めて処理を続けるため、例外は呼び出し元へ届かない。ここで報告する
        await reportErrorEvent({
          serviceId: 'niconico-mylist-assistant',
          severity: 'error',
          title: 'Niconico API エラー',
          message: toErrorMessage(error),
          context: {
            videoId,
            errorCode: error instanceof NiconicoAPIError ? error.code : undefined,
          },
        });
        if (error instanceof NiconicoAPIError) {
          failed.push({ videoId, error: error.message });
        } else {
          failed.push({ videoId, error: '不明なエラー' });
        }
      }
    });

    await Promise.all(promises);

    if (options?.onProgress) {
      options.onProgress(Math.min(i + concurrency, videoIds.length), videoIds.length);
    }
  }

  return { success, failed };
}
