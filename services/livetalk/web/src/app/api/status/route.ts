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
 *
 * chat metrics（promptTokens / latencyMs）は DynamoDB 未永続のため本 Issue のスコープ外。
 * CloudWatch Logs Insights で確認する。
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import {
  DEFAULT_CHARACTER_ID,
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
  NOTIFY_BACKOFF_BASE,
  NOTIFY_RECENT_SESSION_SAMPLE_N,
  NOTIFY_SESSION_GAP_MINUTES,
  resolveLifecycleState,
  shouldNotifyNow,
  extractSessionStartTimes,
  computeSessionIntervals,
  computeBaseIntervalMs,
  computeIntensityFactor,
  type MessageEntity,
  type NotificationEventEntity,
} from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { withApiErrorReporting } from '@/lib/server/api-error-reporting';
import {
  getLifecycleRepository,
  getNotificationEventRepository,
  getStudyTopicRepository,
  getMessageRepository,
} from '@/lib/server/repositories';
import { STATUS_ERROR_MESSAGES } from './constants';
import { hasCharacter } from '@/lib/characters/registry';

/**
 * reason が 'not_due' のときに「インターバル条件が解除される最早時刻」を算出する。
 * shouldNotifyNow の内部ロジックを再現した純粋計算。
 * 活動時間帯ゲート・睡眠帯は考慮しないため、あくまで「インターバル解除の目安」。
 */
function computeNextEarliestAt(
  userMessages: Pick<MessageEntity, 'createdAt'>[],
  notificationEvents: NotificationEventEntity[],
  now: Date
): number {
  const sessionGapMs = NOTIFY_SESSION_GAP_MINUTES * 60 * 1000;
  const sessionStarts = extractSessionStartTimes(userMessages, sessionGapMs);
  const intervals = computeSessionIntervals(sessionStarts, NOTIFY_RECENT_SESSION_SAMPLE_N);
  // 強度係数を反映（decision.ts と同じロジックでミラーする）
  const intensityFactor = computeIntensityFactor(sessionStarts, now);
  const baseIntervalMs = computeBaseIntervalMs(intervals, intensityFactor);

  const lastNormalAt = notificationEvents.find((e) => e.kind === 'normal')?.createdAt ?? 0;
  const lastInteractionAt =
    userMessages.length > 0 ? Math.max(...userMessages.map((m) => m.createdAt)) : 0;
  const referenceTime = Math.max(lastInteractionAt, lastNormalAt);

  const missedCount = notificationEvents.filter(
    (e) => e.kind === 'normal' && e.createdAt > lastInteractionAt
  ).length;

  return referenceTime + baseIntervalMs * Math.pow(NOTIFY_BACKOFF_BASE, missedCount);
}

export const GET = withApiErrorReporting(
  'Web API: ステータス情報取得エラー',
  withAuth(getSession, 'livetalk:admin', async (session, request: Request) => {
    const userId = session.user.id;
    const url = new URL(request.url);
    const queriedId = url.searchParams.get('characterId');
    const characterId = queriedId && hasCharacter(queriedId) ? queriedId : DEFAULT_CHARACTER_ID;
    const now = new Date();

    const [lifecycle, notificationEvents, allMessages, studyPending] = await Promise.all([
      getLifecycleRepository().get({ userId, characterId }),
      getNotificationEventRepository().listByUser(userId, 10),
      getMessageRepository().listSince(userId, characterId, 0),
      getStudyTopicRepository().listByStatus(userId, characterId, 'pending'),
    ]);

    const bedtime = lifecycle?.bedtime ?? LIFECYCLE_DEFAULT_BEDTIME;
    const wakeUpTime = lifecycle?.wakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME;
    const state = resolveLifecycleState(now, bedtime, wakeUpTime);

    const userMessages = allMessages.filter((m) => m.role === 'user');

    const lifecycleForDecision = lifecycle ?? {
      userId,
      characterId,
      bedtime: LIFECYCLE_DEFAULT_BEDTIME,
      wakeUpTime: LIFECYCLE_DEFAULT_WAKE_UP_TIME,
      createdAt: 0,
      updatedAt: 0,
    };

    const notifyDecision = shouldNotifyNow({
      userMessages,
      lifecycle: lifecycleForDecision,
      notificationEvents,
      now,
    });

    let nextEarliestAt: number | undefined;
    if (!notifyDecision.notify && notifyDecision.reason === 'not_due') {
      nextEarliestAt = computeNextEarliestAt(userMessages, notificationEvents, now);
    }

    return NextResponse.json({
      lifecycle: {
        state,
        bedtime,
        wakeUpTime,
        userActivityProfile: lifecycle?.userActivityProfile ?? null,
      },
      recentNotifications: notificationEvents.slice(0, 5).map((e) => ({
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
      studyTopicPendingCount: studyPending.length,
    });
  }),
  { error: 'FETCH_FAILED', message: STATUS_ERROR_MESSAGES.FETCH_FAILED }
);
