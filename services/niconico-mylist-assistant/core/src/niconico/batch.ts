import { getVideoInfo, NiconicoAPIError, NiconicoVideoInfo } from './client';
import { DEFAULT_BATCH_CONCURRENCY, NICONICO_ERROR_MESSAGES } from './constants';

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

  // 並列数を制限しながら取得
  for (let i = 0; i < videoIds.length; i += concurrency) {
    const batch = videoIds.slice(i, i + concurrency);
    const promises = batch.map(async (videoId) => {
      try {
        const info = await getVideoInfo(videoId);
        success.push(info);
      } catch (error) {
        if (error instanceof NiconicoAPIError) {
          failed.push({ videoId, error: error.message });
        } else {
          failed.push({ videoId, error: NICONICO_ERROR_MESSAGES.UNKNOWN_ERROR });
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
