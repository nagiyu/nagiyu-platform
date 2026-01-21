import { NextRequest, NextResponse } from 'next/server';
import { getVideo, updateVideoSettings } from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UpdateSettingsRequest {
  isFavorite?: boolean;
  isSkip?: boolean;
  memo?: string;
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    
    // 認証チェック
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // リクエストボディのバリデーション
    const body: UpdateSettingsRequest = await request.json();

    if (
      body.isFavorite !== undefined &&
      typeof body.isFavorite !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'isFavorite must be a boolean' },
        { status: 400 }
      );
    }

    if (body.isSkip !== undefined && typeof body.isSkip !== 'boolean') {
      return NextResponse.json(
        { error: 'isSkip must be a boolean' },
        { status: 400 }
      );
    }

    if (body.memo !== undefined && typeof body.memo !== 'string') {
      return NextResponse.json(
        { error: 'memo must be a string' },
        { status: 400 }
      );
    }

    // memo の長さ制限
    if (body.memo && body.memo.length > 1000) {
      return NextResponse.json(
        { error: 'memo must be 1000 characters or less' },
        { status: 400 }
      );
    }

    // 動画存在確認
    const video = await getVideo(session.user.id, id);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // 設定更新
    await updateVideoSettings(session.user.id, id, {
      isFavorite: body.isFavorite,
      isSkip: body.isSkip,
      memo: body.memo,
    });

    // 更新後の動画情報を取得
    const updatedVideo = await getVideo(session.user.id, id);

    return NextResponse.json({ video: updatedVideo });
  } catch (error) {
    console.error('Update video settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
