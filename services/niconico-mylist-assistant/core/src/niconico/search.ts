import { NiconicoAPIError, type NiconicoVideoInfo } from './client.js';
import { getVideoInfoBatch } from './batch.js';
import {
  NICONICO_ERROR_MESSAGES,
  NICONICO_SEARCH_URL_BASE,
  SEARCH_RESULT_LIMIT,
  SEARCH_VIDEO_ID_PATTERN,
} from './constants.js';

export function extractVideoIdsFromHtml(html: string): string[] {
  const matchedIds = html.match(SEARCH_VIDEO_ID_PATTERN) ?? [];
  return [...new Set(matchedIds)];
}

export async function searchVideos(keyword: string): Promise<NiconicoVideoInfo[]> {
  const trimmedKeyword = keyword.trim();
  if (!trimmedKeyword) {
    throw new NiconicoAPIError(NICONICO_ERROR_MESSAGES.SEARCH_KEYWORD_REQUIRED, 'INVALID_KEYWORD');
  }

  const response = await fetch(`${NICONICO_SEARCH_URL_BASE}${encodeURIComponent(trimmedKeyword)}`);
  if (!response.ok) {
    throw new NiconicoAPIError(
      `${NICONICO_ERROR_MESSAGES.SEARCH_HTTP_ERROR}: ${response.status}`,
      'SEARCH_HTTP_ERROR'
    );
  }

  const html = await response.text();
  // 要件で上限10件のため、表示とAPI呼び出し負荷を抑えつつ上位結果のみ取得する
  const videoIds = extractVideoIdsFromHtml(html).slice(0, SEARCH_RESULT_LIMIT);
  if (videoIds.length === 0) {
    return [];
  }

  const { success } = await getVideoInfoBatch(videoIds);
  return success;
}
