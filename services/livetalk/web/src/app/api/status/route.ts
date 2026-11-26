/**
 * GET /api/status
 *
 * livetalk:admin 権限保持者向けのデバッグ用ステータス集約 API（Issue #3363）。
 *
 * 返却内容:
 *   - ライフサイクル状態（state / bedtime / wakeUpTime / userActivityProfile）
 *   - 直近通知履歴（最新 5 件）
 *   - 現時点の通知判定結果（shouldNotifyNow の reason / toneBucket 等）
 *   - インターバル解除予測時刻（reason が not_due の場合のみ）
 *   - STUDY_TOPIC pending 件数
 *   - 勉強が止まっている理由の要約（studyState）
 *   - 3 日ルール（studyPause: 停止中か / 最後の発話 / 停止する時刻）
 *   - 勉強の日次の回数と上限（studyUsage）
 *   - 鮮度確認の依頼待ち（freshnessCheckRequests）
 *   - 重要通知の判定の手前（criticalCandidates: 判定に渡る候補 / 鮮度切れで外れた話題 / 送り済み）
 *
 * chat metrics（promptTokens / latencyMs）は DynamoDB 未永続のため本 Issue のスコープ外。
 * CloudWatch Logs Insights で確認する。
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { DEFAULT_CHARACTER_ID } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { withApiErrorReporting } from '@/lib/server/api-error-reporting';
import { loadStatusSnapshot } from '@/lib/server/status';
import { STATUS_ERROR_MESSAGES } from './constants';
import { hasCharacter } from '@/lib/characters/registry';

export const GET = withApiErrorReporting(
  'Web API: ステータス情報取得エラー',
  withAuth(getSession, 'livetalk:admin', async (session, request: Request) => {
    const userId = session.user.id;
    const url = new URL(request.url);
    const queriedId = url.searchParams.get('characterId');
    const characterId = queriedId && hasCharacter(queriedId) ? queriedId : DEFAULT_CHARACTER_ID;
    const snapshot = await loadStatusSnapshot(userId, characterId, new Date());
    const { notifyDecision, nextEarliestAt } = snapshot;

    return NextResponse.json({
      lifecycle: snapshot.lifecycle,
      recentNotifications: snapshot.recentNotifications.map((e) => ({
        notifId: e.notifId,
        kind: e.kind,
        title: e.title,
        body: e.body.slice(0, 100),
        createdAt: e.createdAt,
        consumedAt: e.consumedAt ?? null,
      })),
      notifyDecision: {
        ...notifyDecision,
        ...(nextEarliestAt !== undefined ? { nextEarliestAt } : {}),
      },
      studyTopicPendingCount: snapshot.studyTopicPendingCount,
      studyState: snapshot.studyState,
      studyPause: snapshot.studyPause,
      studyUsage: snapshot.studyUsage,
      freshnessCheckRequests: snapshot.freshnessCheckRequests,
      criticalCandidates: snapshot.criticalCandidates,
    });
  }),
  { error: 'FETCH_FAILED', message: STATUS_ERROR_MESSAGES.FETCH_FAILED }
);
