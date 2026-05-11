import { NextRequest, NextResponse } from 'next/server';
import {
  getVideoBasicInfo,
  getUserVideoSetting,
  deleteUserVideoSetting,
  deleteVideoBasicInfo,
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
      getUserVideoSetting(session.user.userId, id),
    ]);

    if (!basicInfo) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_NOT_FOUND }, { status: 404 });
    }

    // 結合してレスポンス
    const video = {
      videoId: basicInfo.videoId,
      title: basicInfo.title,
      thumbnailUrl: basicInfo.thumbnailUrl,
      length: basicInfo.length,
      createdAt: setting?.CreatedAt ?? basicInfo.CreatedAt,
      userSetting: setting
        ? {
            videoId: setting.videoId,
            isFavorite: setting.isFavorite,
            isSkip: setting.isSkip,
            memo: setting.memo,
            createdAt: setting.CreatedAt,
            updatedAt: setting.UpdatedAt,
          }
        : undefined,
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

    // 動画本体（VideoBasicInfo）とユーザー設定（UserVideoSetting）の存在確認
    // どちらか一方でも残っているケース（過去の片側削除で取り残されたゴミ）を
    // 確実に掃除するため、両方を取得してから片方ずつ削除する
    const [basicInfo, setting] = await Promise.all([
      getVideoBasicInfo(id),
      getUserVideoSetting(session.user.userId, id),
    ]);

    if (!basicInfo && !setting) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_NOT_FOUND }, { status: 404 });
    }

    await Promise.all([
      basicInfo ? deleteVideoBasicInfo(id) : Promise.resolve(),
      setting ? deleteUserVideoSetting(session.user.userId, id) : Promise.resolve(),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete video error:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
