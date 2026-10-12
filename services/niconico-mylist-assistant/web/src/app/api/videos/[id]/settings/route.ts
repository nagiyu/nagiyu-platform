import { NextRequest, NextResponse } from 'next/server';
import {
  createUserVideoSetting,
  getVideoBasicInfo,
  getUserVideoSetting,
  updateUserVideoSetting,
} from '@nagiyu/niconico-mylist-assistant-core';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // 認証チェック
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    // リクエストボディのバリデーション
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: ERROR_MESSAGES.INVALID_REQUEST_BODY }, { status: 400 });
    }

    const { isFavorite, isSkip, memo } = bodyResult.body;

    if (isFavorite !== undefined && typeof isFavorite !== 'boolean') {
      return NextResponse.json(
        { error: ERROR_MESSAGES.IS_FAVORITE_MUST_BE_BOOLEAN },
        { status: 400 }
      );
    }

    if (isSkip !== undefined && typeof isSkip !== 'boolean') {
      return NextResponse.json({ error: ERROR_MESSAGES.IS_SKIP_MUST_BE_BOOLEAN }, { status: 400 });
    }

    if (memo !== undefined && typeof memo !== 'string') {
      return NextResponse.json({ error: ERROR_MESSAGES.MEMO_MUST_BE_STRING }, { status: 400 });
    }

    // memo の長さ制限
    if (memo && memo.length > 1000) {
      return NextResponse.json({ error: ERROR_MESSAGES.MEMO_TOO_LONG }, { status: 400 });
    }

    // 動画とユーザー設定を取得
    const [basicInfo, setting] = await Promise.all([
      getVideoBasicInfo(id),
      getUserVideoSetting(session.user.id, id),
    ]);
    if (!basicInfo) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_NOT_FOUND }, { status: 404 });
    }

    // 設定更新（設定未作成の場合は新規作成）
    const updatedSetting = setting
      ? await updateUserVideoSetting(session.user.id, id, {
          isFavorite,
          isSkip,
          memo,
        })
      : await createUserVideoSetting({
          userId: session.user.id,
          videoId: id,
          isFavorite: isFavorite ?? false,
          isSkip: isSkip ?? false,
          memo,
        });

    const video = {
      videoId: updatedSetting.videoId,
      title: basicInfo?.title || '',
      thumbnailUrl: basicInfo?.thumbnailUrl || '',
      length: basicInfo?.length || '',
      createdAt: updatedSetting.CreatedAt,
      userSetting: {
        videoId: updatedSetting.videoId,
        isFavorite: updatedSetting.isFavorite,
        isSkip: updatedSetting.isSkip,
        memo: updatedSetting.memo,
        createdAt: updatedSetting.CreatedAt,
        updatedAt: updatedSetting.UpdatedAt,
      },
    };

    return NextResponse.json({ video });
  } catch (error) {
    console.error('Update video settings error:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
