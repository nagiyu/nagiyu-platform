import { NextRequest, NextResponse } from 'next/server';
import {
  getVideoInfoBatch,
  createVideoBasicInfo,
  getUserVideoSetting,
  upsertUserVideoSetting,
} from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface BulkImportRequest {
  videoIds: string[];
}

interface BulkImportResponse {
  success: {
    videoId: string;
    title: string;
  }[];
  skipped: {
    videoId: string;
    reason: string;
  }[];
  failed: {
    videoId: string;
    error: string;
  }[];
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    // リクエストボディのバリデーション
    const body: BulkImportRequest = await request.json();

    if (!Array.isArray(body.videoIds)) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_IDS_MUST_BE_ARRAY }, { status: 400 });
    }

    if (body.videoIds.length === 0) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_IDS_EMPTY }, { status: 400 });
    }

    if (body.videoIds.length > 100) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_IDS_TOO_MANY }, { status: 400 });
    }

    // 動画 ID のバリデーション（sm[数字] 形式）
    const invalidIds = body.videoIds.filter((id) => !/^sm\d+$/.test(id));

    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          error: ERROR_MESSAGES.INVALID_VIDEO_ID_FORMAT,
          invalidIds,
        },
        { status: 400 }
      );
    }

    // 重複チェック（ユーザー設定の存在を確認）
    const existingSettings = await Promise.all(
      body.videoIds.map((id) => getUserVideoSetting(session.user.id, id))
    );

    const skipped: BulkImportResponse['skipped'] = [];
    const videoIdsToImport: string[] = [];

    body.videoIds.forEach((id, index) => {
      if (existingSettings[index]) {
        skipped.push({
          videoId: id,
          reason: 'Already exists',
        });
      } else {
        videoIdsToImport.push(id);
      }
    });

    // ニコニコ動画 API から情報取得
    const { success: videoInfos, failed: apiFailed } = await getVideoInfoBatch(videoIdsToImport);

    // DynamoDB に保存（Promise.allSettled でエラーハンドリング）
    const success: BulkImportResponse['success'] = [];
    const dbFailed: BulkImportResponse['failed'] = [];

    const saveResults = await Promise.allSettled(
      videoInfos.map(async (info) => {
        // 1. 動画基本情報を保存（既存の場合はスキップ）
        try {
          await createVideoBasicInfo({
            videoId: info.videoId,
            title: info.title,
            thumbnailUrl: info.thumbnailUrl,
            length: info.duration
              ? `${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}`
              : '0:00',
          });
        } catch (error) {
          // ConditionalCheckFailedException の場合は既に存在するのでOK
          // その他のエラーは throw
          if (error instanceof Error && !error.message.includes('ConditionalCheckFailed')) {
            throw error;
          }
        }

        // 2. ユーザー設定を作成
        await upsertUserVideoSetting({
          userId: session.user.id,
          videoId: info.videoId,
          isFavorite: false,
          isSkip: false,
        });

        return info;
      })
    );

    // 保存結果の処理
    saveResults.forEach((result, index) => {
      const info = videoInfos[index];
      if (result.status === 'fulfilled') {
        success.push({
          videoId: info.videoId,
          title: info.title,
        });
      } else {
        dbFailed.push({
          videoId: info.videoId,
          error: result.reason instanceof Error ? result.reason.message : 'Failed to save',
        });
      }
    });

    const response: BulkImportResponse = {
      success,
      skipped,
      failed: [...apiFailed, ...dbFailed],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Bulk import error:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
