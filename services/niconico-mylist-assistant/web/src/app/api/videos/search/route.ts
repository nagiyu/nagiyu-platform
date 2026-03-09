import { NextRequest, NextResponse } from 'next/server';
import { searchVideos } from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

const SEARCH_KEYWORD_MAX_LENGTH = 100;

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

    if (keyword.length > SEARCH_KEYWORD_MAX_LENGTH) {
      return NextResponse.json({ error: ERROR_MESSAGES.SEARCH_KEYWORD_TOO_LONG }, { status: 400 });
    }

    const videos = await searchVideos(keyword);
    return NextResponse.json({ videos, total: videos.length });
  } catch (error) {
    console.error('動画検索エラー:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
