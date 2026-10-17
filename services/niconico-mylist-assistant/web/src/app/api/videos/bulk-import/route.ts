import { NextRequest, NextResponse } from 'next/server';
import {
  getVideoInfoBatch,
  createVideoBasicInfo,
  getUserVideoSetting,
  upsertUserVideoSetting,
  BulkImportResponse,
} from '@nagiyu/niconico-mylist-assistant-core';
import { EntityAlreadyExistsError, reportErrorEvent } from '@nagiyu/aws';
import { toErrorMessage } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createWithApiErrorReportingBody } from '@/lib/api-error-reporting';

/**
 * 動画 ID (英字接頭辞 + 数字) の形式かを判定する
 *
 * 正規表現は引数を文字列へ変換して判定するため、文字列以外 (例: ['sm1']) を通さないよう型を先に確かめる。
 */
const isVideoId = (id: unknown): id is string => typeof id === 'string' && /^[a-z]+\d+$/.test(id);

const withApiErrorReporting = createWithApiErrorReportingBody('Bulk import error:', {
  error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
});

export const POST = withApiErrorReporting(
  'Web API: 動画一括登録エラー',
  async (request: NextRequest) => {
    // 認証チェック
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    // リクエストボディのバリデーション
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: ERROR_MESSAGES.INVALID_REQUEST_BODY }, { status: 400 });
    }

    const { videoIds } = bodyResult.body;

    if (!Array.isArray(videoIds)) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_IDS_MUST_BE_ARRAY }, { status: 400 });
    }

    if (videoIds.length === 0) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_IDS_EMPTY }, { status: 400 });
    }

    if (videoIds.length > 100) {
      return NextResponse.json({ error: ERROR_MESSAGES.VIDEO_IDS_TOO_MANY }, { status: 400 });
    }

    // 動画 ID のバリデーション（英字接頭辞 + 数字 形式）
    const invalidIds = videoIds.filter((id) => !isVideoId(id));

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
    const validVideoIds = videoIds.filter(isVideoId);
    const existingSettings = await Promise.all(
      validVideoIds.map((id) => getUserVideoSetting(session.user.id, id))
    );

    let skippedCount = 0;
    const videoIdsToImport: string[] = [];

    validVideoIds.forEach((id, index) => {
      if (existingSettings[index]) {
        skippedCount++;
      } else {
        videoIdsToImport.push(id);
      }
    });

    // ニコニコ動画 API から情報取得
    const { success: videoInfos, failed: apiFailed } = await getVideoInfoBatch(videoIdsToImport);

    // DynamoDB に保存（Promise.allSettled でエラーハンドリング）
    let successCount = 0;
    let dbFailedCount = 0;

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
          // 既に存在する場合はOK
          // その他のエラーは throw
          if (!(error instanceof EntityAlreadyExistsError)) {
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
    // 失敗件数に数えてレスポンスを返すため、例外は上に届かない。ここで報告する
    const saveFailures: Array<{ videoId: string; reason: unknown }> = [];
    saveResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        dbFailedCount++;
        saveFailures.push({ videoId: videoInfos[index].videoId, reason: result.reason });
      }
    });
    await Promise.all(
      saveFailures.map(({ videoId, reason }) =>
        reportErrorEvent({
          serviceId: 'niconico-mylist-assistant',
          severity: 'error',
          title: 'Web API: 動画一括登録の保存エラー',
          message: toErrorMessage(reason),
          context: {
            userId: session.user.id,
            videoId,
            errorName: reason instanceof Error ? reason.name : typeof reason,
            errorStack: reason instanceof Error ? reason.stack : undefined,
          },
        })
      )
    );

    const response: BulkImportResponse = {
      success: successCount,
      failed: apiFailed.length + dbFailedCount,
      skipped: skippedCount,
      total: validVideoIds.length,
      failedDetails: apiFailed.length > 0 ? apiFailed : undefined,
    };

    return NextResponse.json(response);
  }
);
