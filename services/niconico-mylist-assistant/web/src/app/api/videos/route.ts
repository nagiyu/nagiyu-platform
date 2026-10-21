import { NextRequest, NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import {
  listVideosWithSettings,
  type VideosListResponse,
  type VideoData,
} from '@nagiyu/niconico-mylist-assistant-core';
import { PAGINATION_ERROR_CODES, PaginationValidationError, parsePagination } from '@nagiyu/nextjs';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createWithApiErrorReportingBody } from '@/lib/api-error-reporting';

/**
 * 動画一覧取得 API
 *
 * ユーザーの動画データを一覧で取得します。
 * ページネーション（offset/limit方式）とフィルタリング（お気に入り、スキップ）に対応しています。
 *
 * @see api-spec.md Section 3.2.1
 * @param request - Next.js リクエストオブジェクト
 * @returns 動画一覧レスポンス
 */
const withApiErrorReporting = createWithApiErrorReportingBody('動画一覧取得エラー:', {
  error: {
    code: 'DATABASE_ERROR',
    message: 'データベースへのアクセスに失敗しました',
  },
});

export const GET = withApiErrorReporting(
  'Web API: 動画一覧取得エラー',
  async (request: NextRequest) => {
    try {
      // 認証チェック
      const session = await getSession();
      if (!session?.user) {
        return NextResponse.json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: ERROR_MESSAGES.UNAUTHORIZED,
            },
          },
          { status: 401 }
        );
      }

      // クエリパラメータの取得
      const searchParams = request.nextUrl.searchParams;
      const offsetParam = searchParams.get('offset');
      const isFavoriteParam = searchParams.get('isFavorite');
      const isSkipParam = searchParams.get('isSkip');
      const searchKeyword = searchParams.get('search')?.trim() || undefined;

      // パラメータのパース
      const { limit } = parsePagination(request);
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

      // バリデーション: offset
      if (isNaN(offset) || offset < 0) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_REQUEST',
              message: COMMON_ERROR_MESSAGES.BAD_REQUEST,
              details: 'offset は 0 以上である必要があります',
            },
          },
          { status: 400 }
        );
      }

      // フィルタパラメータのパース
      let isFavorite: boolean | undefined;
      if (isFavoriteParam !== null) {
        if (isFavoriteParam === 'true') {
          isFavorite = true;
        } else if (isFavoriteParam === 'false') {
          isFavorite = false;
        } else {
          return NextResponse.json(
            {
              error: {
                code: 'INVALID_REQUEST',
                message: COMMON_ERROR_MESSAGES.BAD_REQUEST,
                details: 'isFavorite は true または false である必要があります',
              },
            },
            { status: 400 }
          );
        }
      }

      let isSkip: boolean | undefined;
      if (isSkipParam !== null) {
        if (isSkipParam === 'true') {
          isSkip = true;
        } else if (isSkipParam === 'false') {
          isSkip = false;
        } else {
          return NextResponse.json(
            {
              error: {
                code: 'INVALID_REQUEST',
                message: COMMON_ERROR_MESSAGES.BAD_REQUEST,
                details: 'isSkip は true または false である必要があります',
              },
            },
            { status: 400 }
          );
        }
      }

      // 動画一覧を取得
      const { videos: rawVideos, total } = await listVideosWithSettings(session.user.id, {
        limit,
        offset,
        isFavorite,
        isSkip,
        searchKeyword,
      });

      // レスポンス形式に変換
      const videos: VideoData[] = rawVideos.map((video) => ({
        videoId: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        length: video.length,
        createdAt: video.createdAt,
        userSetting: video.userSetting
          ? {
              videoId: video.videoId,
              isFavorite: video.userSetting.isFavorite,
              isSkip: video.userSetting.isSkip,
              memo: video.userSetting.memo,
              createdAt: video.userSetting.createdAt,
              updatedAt: video.userSetting.updatedAt,
            }
          : undefined,
      }));

      // レスポンス
      const response: VideosListResponse = {
        videos,
        total,
        limit,
        offset,
      };

      return NextResponse.json(response);
    } catch (error) {
      if (
        error instanceof PaginationValidationError &&
        error.code === PAGINATION_ERROR_CODES.INVALID_LIMIT
      ) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_REQUEST',
              message: COMMON_ERROR_MESSAGES.BAD_REQUEST,
              details: error.message,
            },
          },
          { status: 400 }
        );
      }

      // 想定外の例外はラッパーが 500 に変換して報告する
      throw error;
    }
  }
);
