import { NiconicoAPIError, type NiconicoVideoInfo } from './client.js';
import { getVideoInfoBatch } from './batch.js';
import {
  NICONICO_ERROR_MESSAGES,
  NICONICO_SEARCH_URL_BASE,
  SEARCH_RESULT_LIMIT,
} from './constants.js';

const VIDEO_ID_PATTERN = /\b(?:sm|nm|so)\d+\b/g;

export function extractVideoIdsFromHtml(html: string): string[] {
  const matchedIds = html.match(VIDEO_ID_PATTERN) ?? [];
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
  const videoIds = extractVideoIdsFromHtml(html).slice(0, SEARCH_RESULT_LIMIT);
  if (videoIds.length === 0) {
    return [];
  }

  const { success } = await getVideoInfoBatch(videoIds);
  return success;
}
