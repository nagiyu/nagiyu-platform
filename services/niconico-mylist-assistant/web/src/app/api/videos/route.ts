import { NextRequest, NextResponse } from 'next/server';
import {
  listUserVideoSettings,
  batchGetVideoBasicInfo,
} from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';

/**
 * 動画一覧取得 API
 *
 * ユーザーの動画データを一覧で取得します。
 * ページネーションとフィルタリング（お気に入り、スキップ）に対応しています。
 *
 * @param request - Next.js リクエストオブジェクト
 * @returns 動画一覧レスポンス
 */
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // クエリパラメータの取得
    const searchParams = request.nextUrl.searchParams;
    const filter = searchParams.get('filter') as 'favorite' | 'skip' | 'all' | null;
    const limitParam = searchParams.get('limit');
    const lastEvaluatedKey = searchParams.get('lastEvaluatedKey');

    // limit のパース（デフォルト: 100）
    const limit = limitParam ? parseInt(limitParam, 10) : 100;

    // バリデーション: filter
    if (filter && !['favorite', 'skip', 'all'].includes(filter)) {
      return NextResponse.json(
        { error: 'filter パラメータは "favorite", "skip", または "all" である必要があります' },
        { status: 400 }
      );
    }

    // バリデーション: limit
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'limit パラメータは 1 から 100 の間である必要があります' },
        { status: 400 }
      );
    }

    // lastEvaluatedKey のデコード
    let decodedLastEvaluatedKey: Record<string, string> | undefined;
    if (lastEvaluatedKey) {
      try {
        decodedLastEvaluatedKey = JSON.parse(
          Buffer.from(lastEvaluatedKey, 'base64').toString('utf-8')
        );
      } catch (error) {
        console.error('lastEvaluatedKey のデコードに失敗しました:', error);
        return NextResponse.json(
          { error: 'lastEvaluatedKey パラメータが無効です' },
          { status: 400 }
        );
      }
    }

    // ユーザー設定を取得
    const { settings, lastEvaluatedKey: nextKey } = await listUserVideoSettings(session.user.id, {
      limit,
      lastEvaluatedKey: decodedLastEvaluatedKey,
    });

    // フィルタリング処理
    let filteredSettings = settings;
    if (filter === 'favorite') {
      filteredSettings = settings.filter((s) => s.isFavorite);
    } else if (filter === 'skip') {
      filteredSettings = settings.filter((s) => s.isSkip);
    }

    // 動画基本情報を一括取得
    const videoIds = filteredSettings.map((s) => s.videoId);
    const basicInfos = videoIds.length > 0 ? await batchGetVideoBasicInfo(videoIds) : [];

    // 動画基本情報をマップに変換
    const basicInfoMap = new Map(basicInfos.map((info) => [info.videoId, info]));

    // 結合してレスポンス用の形式に変換
    const videos = filteredSettings
      .map((setting) => {
        const basicInfo = basicInfoMap.get(setting.videoId);
        if (!basicInfo) {
          return null;
        }

        return {
          videoId: setting.videoId,
          title: basicInfo.title,
          thumbnailUrl: basicInfo.thumbnailUrl,
          length: basicInfo.length,
          isFavorite: setting.isFavorite,
          isSkip: setting.isSkip,
          memo: setting.memo,
          createdAt: setting.createdAt,
          updatedAt: setting.updatedAt,
        };
      })
      .filter((v) => v !== null);

    // nextToken のエンコード
    const nextToken = nextKey ? Buffer.from(JSON.stringify(nextKey)).toString('base64') : null;

    // レスポンス
    return NextResponse.json({
      videos,
      nextToken,
    });
  } catch (error) {
    console.error('動画一覧取得エラー:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
