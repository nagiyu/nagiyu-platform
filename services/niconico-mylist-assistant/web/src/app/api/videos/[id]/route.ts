import { NextRequest, NextResponse } from 'next/server';
import {
  getVideoBasicInfo,
  getUserVideoSetting,
  deleteUserVideoSetting,
  toVideoAPI,
  toUserSettingAPI,
} from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // 認証チェック
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    // 動画基本情報とユーザー設定を並行取得
    const [basicInfo, setting] = await Promise.all([
      getVideoBasicInfo(id),
      getUserVideoSetting(session.user.id, id),
    ]);

    if (!basicInfo) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_NOT_FOUND }, { status: 404 });
    }

    // 内部型から API 型に変換
    const videoAPI = toVideoAPI(basicInfo);
    const settingAPI = setting ? toUserSettingAPI(setting) : null;

    // 結合してレスポンス
    const video = {
      videoId: videoAPI.videoId,
      title: videoAPI.title,
      thumbnailUrl: videoAPI.thumbnailUrl,
      length: videoAPI.length,
      isFavorite: settingAPI?.isFavorite ?? false,
      isSkip: settingAPI?.isSkip ?? false,
      memo: settingAPI?.memo,
      createdAt: settingAPI?.createdAt ?? videoAPI.createdAt,
      updatedAt: settingAPI?.updatedAt ?? videoAPI.createdAt,
    };

    return NextResponse.json({ video });
  } catch (error) {
    console.error('Get video error:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // 認証チェック
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    // ユーザー設定の存在確認
    const setting = await getUserVideoSetting(session.user.id, id);
    if (!setting) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_NOT_FOUND }, { status: 404 });
    }

    // ユーザー設定を削除
    await deleteUserVideoSetting(session.user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete video error:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
