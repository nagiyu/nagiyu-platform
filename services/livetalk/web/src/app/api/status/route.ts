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
 *   - KNOWLEDGE 件数 / STUDY_TOPIC pending 件数
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
  type MessageEntity,
  type NotificationEventEntity,
} from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import {
  getLifecycleRepository,
  getNotificationEventRepository,
  getKnowledgeRepository,
  getStudyTopicRepository,
  getMessageRepository,
} from '@/lib/server/repositories';
import { STATUS_ERROR_MESSAGES } from './constants';

/**
 * reason が 'not_due' のときに「インターバル条件が解除される最早時刻」を算出する。
 * shouldNotifyNow の内部ロジックを再現した純粋計算。
 * 活動時間帯ゲート・睡眠帯は考慮しないため、あくまで「インターバル解除の目安」。
 */
function computeNextEarliestAt(
  userMessages: Pick<MessageEntity, 'CreatedAt'>[],
  notificationEvents: NotificationEventEntity[]
): number {
  const sessionGapMs = NOTIFY_SESSION_GAP_MINUTES * 60 * 1000;
  const sessionStarts = extractSessionStartTimes(userMessages, sessionGapMs);
  const intervals = computeSessionIntervals(sessionStarts, NOTIFY_RECENT_SESSION_SAMPLE_N);
  const baseIntervalMs = computeBaseIntervalMs(intervals);

  const lastNormalAt = notificationEvents.find((e) => e.Kind === 'normal')?.CreatedAt ?? 0;
  const lastInteractionAt =
    userMessages.length > 0 ? Math.max(...userMessages.map((m) => m.CreatedAt)) : 0;
  const referenceTime = Math.max(lastInteractionAt, lastNormalAt);

  const missedCount = notificationEvents.filter(
    (e) => e.Kind === 'normal' && e.CreatedAt > lastInteractionAt
  ).length;

  return referenceTime + baseIntervalMs * Math.pow(NOTIFY_BACKOFF_BASE, missedCount);
}

export const GET = withAuth(getSession, 'livetalk:admin', async (session) => {
  const userId = session.user.googleId;
  const characterId = DEFAULT_CHARACTER_ID;
  const now = new Date();

  try {
    const [lifecycle, notificationEvents, allMessages, knowledge, studyPending] = await Promise.all(
      [
        getLifecycleRepository().get({ userId, characterId }),
        getNotificationEventRepository().listByUser(userId, 10),
        getMessageRepository().listSince(userId, characterId, 0),
        getKnowledgeRepository().list(userId, characterId),
        getStudyTopicRepository().listByStatus(userId, characterId, 'pending'),
      ]
    );

    const bedtime = lifecycle?.Bedtime ?? LIFECYCLE_DEFAULT_BEDTIME;
    const wakeUpTime = lifecycle?.WakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME;
    const state = resolveLifecycleState(now, bedtime, wakeUpTime);

    const userMessages = allMessages.filter((m) => m.Role === 'user');

    const lifecycleForDecision = lifecycle ?? {
      UserID: userId,
      CharacterID: characterId,
      Bedtime: LIFECYCLE_DEFAULT_BEDTIME,
      WakeUpTime: LIFECYCLE_DEFAULT_WAKE_UP_TIME,
      CreatedAt: 0,
      UpdatedAt: 0,
    };

    const notifyDecision = shouldNotifyNow({
      userMessages,
      lifecycle: lifecycleForDecision,
      notificationEvents,
      now,
    });

    let nextEarliestAt: number | undefined;
    if (!notifyDecision.notify && notifyDecision.reason === 'not_due') {
      nextEarliestAt = computeNextEarliestAt(userMessages, notificationEvents);
    }

    return NextResponse.json({
      lifecycle: {
        state,
        bedtime,
        wakeUpTime,
        userActivityProfile: lifecycle?.UserActivityProfile ?? null,
      },
      recentNotifications: notificationEvents.slice(0, 5).map((e) => ({
        notifId: e.NotifID,
        kind: e.Kind,
        title: e.Title,
        body: e.Body.slice(0, 100),
        createdAt: e.CreatedAt,
        consumedAt: e.ConsumedAt ?? null,
      })),
      notifyDecision: {
        ...notifyDecision,
        ...(nextEarliestAt !== undefined ? { nextEarliestAt } : {}),
      },
      knowledgeCount: knowledge.length,
      studyTopicPendingCount: studyPending.length,
    });
  } catch (error) {
    console.error('[GET /api/status] ステータス情報の取得に失敗しました', error);
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: STATUS_ERROR_MESSAGES.FETCH_FAILED },
      { status: 500 }
    );
  }
});
