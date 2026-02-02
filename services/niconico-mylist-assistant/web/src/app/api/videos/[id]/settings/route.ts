import { NextRequest, NextResponse } from 'next/server';
import {
  getVideoBasicInfo,
  getUserVideoSetting,
  updateUserVideoSetting,
} from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UpdateSettingsRequest {
  isFavorite?: boolean;
  isSkip?: boolean;
  memo?: string;
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
    const body: UpdateSettingsRequest = await request.json();

    if (body.isFavorite !== undefined && typeof body.isFavorite !== 'boolean') {
      return NextResponse.json(
        { error: ERROR_MESSAGES.IS_FAVORITE_MUST_BE_BOOLEAN },
        { status: 400 }
      );
    }

    if (body.isSkip !== undefined && typeof body.isSkip !== 'boolean') {
      return NextResponse.json({ error: ERROR_MESSAGES.IS_SKIP_MUST_BE_BOOLEAN }, { status: 400 });
    }

    if (body.memo !== undefined && typeof body.memo !== 'string') {
      return NextResponse.json({ error: ERROR_MESSAGES.MEMO_MUST_BE_STRING }, { status: 400 });
    }

    // memo の長さ制限
    if (body.memo && body.memo.length > 1000) {
      return NextResponse.json({ error: ERROR_MESSAGES.MEMO_TOO_LONG }, { status: 400 });
    }

    // ユーザー設定の存在確認
    const setting = await getUserVideoSetting(session.user.id, id);
    if (!setting) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_NOT_FOUND }, { status: 404 });
    }

    // 設定更新
    const updatedSetting = await updateUserVideoSetting(session.user.id, id, {
      isFavorite: body.isFavorite,
      isSkip: body.isSkip,
      memo: body.memo,
    });

    // 動画基本情報を取得して結合
    const basicInfo = await getVideoBasicInfo(id);

    const video = {
      videoId: updatedSetting.videoId,
      title: basicInfo?.title || '',
      thumbnailUrl: basicInfo?.thumbnailUrl || '',
      length: basicInfo?.length || '',
      isFavorite: updatedSetting.isFavorite,
      isSkip: updatedSetting.isSkip,
      memo: updatedSetting.memo,
      createdAt: updatedSetting.createdAt,
      updatedAt: updatedSetting.updatedAt,
    };

    return NextResponse.json({ video });
  } catch (error) {
    console.error('Update video settings error:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
