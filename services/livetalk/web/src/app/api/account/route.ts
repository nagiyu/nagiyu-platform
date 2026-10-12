import { NextResponse } from 'next/server';
import type { Session } from '@nagiyu/common';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { withApiErrorReporting } from '@/lib/server/api-error-reporting';
import { getAccountDeletionRepository } from '@/lib/server/repositories';
import { ACCOUNT_ERROR_MESSAGES } from './constants';

/**
 * DELETE /api/account
 *
 * 退会処理。セッションユーザー自身の livetalk データを即時ハード削除する。
 * SafetyEvent（自傷検出ログ）のみ匿名化して保持する（ADR-2.21）。
 *
 * - リクエストボディは不要（本人確認は Phase 3 の UI で担保）。
 * - userId はセッションから取得するため、本人以外のデータは削除されない。
 * - レスポンスには削除件数・匿名化件数を含めない（SafetyEvent の存在を本人に示すのは不適切）。
 */
export const DELETE = withAuth(
  getSession,
  'livetalk:chat',
  withApiErrorReporting(
    'Web API: アカウント削除エラー',
    async (session: Session) => {
      const userId = session.user.id;

      const result = await getAccountDeletionRepository().deleteAccount(userId);
      console.log('[DELETE /api/account] アカウントを削除しました', {
        deletedCount: result.deletedCount,
        anonymizedCount: result.anonymizedCount,
      });
      return NextResponse.json({ deleted: true });
    },
    { error: 'DELETE_FAILED', message: ACCOUNT_ERROR_MESSAGES.DELETE_FAILED }
  )
);
