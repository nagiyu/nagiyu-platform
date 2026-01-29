import { parseStringPromise } from 'xml2js';
import { NICONICO_ERROR_MESSAGES } from './constants';

export interface NiconicoVideoInfo {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  duration: number;
  viewCount: number;
  commentCount: number;
  mylistCount: number;
  uploadedAt: string;
  tags: string[];
}

export class NiconicoAPIError extends Error {
  public code?: string;
  public videoId?: string;

  constructor(message: string, code?: string, videoId?: string) {
    super(message);
    this.name = 'NiconicoAPIError';
    this.code = code;
    this.videoId = videoId;
  }
}

export async function getVideoInfo(videoId: string): Promise<NiconicoVideoInfo> {
  try {
    const response = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`);

    if (!response.ok) {
      throw new NiconicoAPIError(
        `${NICONICO_ERROR_MESSAGES.HTTP_ERROR}: ${response.status}`,
        'HTTP_ERROR',
        videoId
      );
    }

    const xmlText = await response.text();
    const parsed = await parseStringPromise(xmlText);

    // エラーチェック
    if (parsed.nicovideo_thumb_response.$.status !== 'ok') {
      const errorCode = parsed.nicovideo_thumb_response.error?.[0]?.code?.[0];
      const errorDescription = parsed.nicovideo_thumb_response.error?.[0]?.description?.[0];

      throw new NiconicoAPIError(
        errorDescription || NICONICO_ERROR_MESSAGES.API_ERROR,
        errorCode,
        videoId
      );
    }

    const thumb = parsed.nicovideo_thumb_response.thumb[0];

    // タグの抽出
    const tags: string[] = [];
    if (thumb.tags?.[0]?.tag) {
      for (const tag of thumb.tags[0].tag) {
        if (typeof tag === 'string') {
          tags.push(tag);
        } else if (tag._) {
          tags.push(tag._);
        }
      }
    }

    return {
      videoId: thumb.video_id[0],
      title: thumb.title[0],
      description: thumb.description[0],
      thumbnailUrl: thumb.thumbnail_url[0],
      duration: parseDuration(thumb.length[0]),
      viewCount: parseInt(thumb.view_counter[0], 10),
      commentCount: parseInt(thumb.comment_num[0], 10),
      mylistCount: parseInt(thumb.mylist_counter[0], 10),
      uploadedAt: thumb.first_retrieve[0],
      tags,
    };
  } catch (error) {
    if (error instanceof NiconicoAPIError) {
      throw error;
    }

    const errorDetail = error instanceof Error ? error.message : 'Unknown error';
    throw new NiconicoAPIError(
      `${NICONICO_ERROR_MESSAGES.FETCH_ERROR}: ${errorDetail}`,
      'FETCH_ERROR',
      videoId
    );
  }
}

function parseDuration(durationStr: string): number {
  const parts = durationStr.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}
