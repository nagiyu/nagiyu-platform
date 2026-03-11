import { NextRequest, NextResponse } from 'next/server';
import { batchGetVideoBasicInfo, searchVideos } from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES, VALIDATION_LIMITS } from '@/lib/constants/errors';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    const rawKeyword = request.nextUrl.searchParams.get('q');
    const keyword = rawKeyword?.trim() ?? '';

    if (!keyword) {
      return NextResponse.json({ error: ERROR_MESSAGES.SEARCH_KEYWORD_REQUIRED }, { status: 400 });
    }

    if (keyword.length > VALIDATION_LIMITS.SEARCH_KEYWORD_MAX_LENGTH) {
      return NextResponse.json({ error: ERROR_MESSAGES.SEARCH_KEYWORD_TOO_LONG }, { status: 400 });
    }

    const videos = await searchVideos(keyword);

    if (videos.length === 0) {
      return NextResponse.json({ videos, total: 0 });
    }

    const registeredVideos = await batchGetVideoBasicInfo(videos.map((video) => video.videoId));
    const registeredVideoIds = new Set(registeredVideos.map((video) => video.videoId));
    const videosWithRegistration = videos.map((video) => ({
      ...video,
      isRegistered: registeredVideoIds.has(video.videoId),
    }));

    return NextResponse.json({ videos: videosWithRegistration, total: videosWithRegistration.length });
  } catch (error) {
    console.error('動画検索エラー:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
