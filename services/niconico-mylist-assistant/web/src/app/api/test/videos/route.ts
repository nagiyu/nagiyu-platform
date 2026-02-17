import { NextRequest, NextResponse } from 'next/server';
import {
  createVideoBasicInfo,
  deleteVideoBasicInfo,
  upsertUserVideoSetting,
  listVideosWithSettings,
  deleteUserVideoSetting,
} from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface SeedRequest {
  count: number;
  startId?: number;
  favoriteCount?: number;
}

function isTestMode(): boolean {
  return process.env.USE_IN_MEMORY_DB === 'true';
}

export async function POST(request: NextRequest) {
  if (!isTestMode()) {
    return NextResponse.json({ error: ERROR_MESSAGES.TEST_ENDPOINT_NOT_AVAILABLE }, { status: 404 });
  }

  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  try {
    const body = (await request.json()) as SeedRequest;
    const count = body.count;
    const startId = body.startId ?? 50000000;
    const favoriteCount = body.favoriteCount ?? 0;

    for (let i = 0; i < count; i++) {
      const videoId = `sm${startId + i}`;
      await createVideoBasicInfo({
        videoId,
        title: `E2E動画 ${startId + i}`,
        thumbnailUrl: `https://example.com/${videoId}.jpg`,
        length: '3:00',
      });
      await upsertUserVideoSetting({
        userId: session.user.id,
        videoId,
        isFavorite: i < favoriteCount,
        isSkip: false,
      });
    }

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error('Test seed API error:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}

export async function DELETE() {
  if (!isTestMode()) {
    return NextResponse.json({ error: ERROR_MESSAGES.TEST_ENDPOINT_NOT_AVAILABLE }, { status: 404 });
  }

  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  try {
    const { videos } = await listVideosWithSettings(session.user.id);
    await Promise.all(
      videos.map(async (video) => {
        await deleteUserVideoSetting(session.user.id, video.videoId);
        await deleteVideoBasicInfo(video.videoId);
      })
    );
    return NextResponse.json({ success: true, count: videos.length });
  } catch (error) {
    console.error('Test clear API error:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
