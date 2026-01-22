import { NextRequest, NextResponse } from 'next/server';
import { getVideoInfoBatch, createVideo, getVideo } from '@nagiyu/niconico-mylist-assistant-core';
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

    // 重複チェック
    const existingVideos = await Promise.all(
      body.videoIds.map((id) => getVideo(session.user.id, id))
    );

    const skipped: BulkImportResponse['skipped'] = [];
    const videoIdsToImport: string[] = [];

    body.videoIds.forEach((id, index) => {
      if (existingVideos[index]) {
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
    const now = new Date().toISOString();

    const saveResults = await Promise.allSettled(
      videoInfos.map(async (info) => {
        await createVideo(session.user.id, {
          videoId: info.videoId,
          title: info.title,
          description: info.description,
          thumbnailUrl: info.thumbnailUrl,
          duration: info.duration,
          viewCount: info.viewCount,
          commentCount: info.commentCount,
          mylistCount: info.mylistCount,
          uploadedAt: info.uploadedAt,
          tags: info.tags,
          isFavorite: false,
          isSkip: false,
          createdAt: now,
          updatedAt: now,
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
