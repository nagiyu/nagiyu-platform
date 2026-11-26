import {
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
  NOTIFY_EVENT_READ_LIMIT,
  computeNextEarliestAt,
  createLifecycleRepository,
  createMessageRepository,
  createNotificationEventRepository,
  createStudyTopicRepository,
  resolveLifecycleState,
  resolveNotifyMessageSinceMs,
  shouldNotifyNow,
  type LifecycleEntity,
  type NotificationEventEntity,
  type NotifyDecision,
} from '@nagiyu/livetalk-core';

/** 一覧に出す通知の記録の件数。 */
const RECENT_NOTIFICATION_COUNT = 5;

export interface StatusSnapshot {
  lifecycle: {
    state: ReturnType<typeof resolveLifecycleState>;
    bedtime: string;
    wakeUpTime: string;
    userActivityProfile: LifecycleEntity['userActivityProfile'] | null;
  };
  /** 表示キャラクターの通知の記録の、新しい順の先頭。 */
  recentNotifications: NotificationEventEntity[];
  notifyDecision: NotifyDecision;
  /** 判定が not_due のときだけ入る、間隔が解ける目安の時刻。 */
  nextEarliestAt?: number;
  studyTopicPendingCount: number;
}

/**
 * ステータス画面と API が共有する、通知判定の読み取りと計算。
 *
 * 画面と API で読み方が分かれると、見ている判定がバッチの実際とずれる。
 * 会話は通知バッチと同じ期間だけ読み、通知の記録も同じ件数で読んでから表示キャラに絞る。
 */
export async function loadStatusSnapshot(
  userId: string,
  characterId: string,
  now: Date
): Promise<StatusSnapshot> {
  const [lifecycle, allUserEvents, recentMessages, studyPending] = await Promise.all([
    createLifecycleRepository().get({ userId, characterId }),
    createNotificationEventRepository().listByUser(userId, NOTIFY_EVENT_READ_LIMIT),
    createMessageRepository().listSince(userId, characterId, resolveNotifyMessageSinceMs(now)),
    createStudyTopicRepository().listByStatus(userId, characterId, 'pending'),
  ]);

  // 通知の記録は利用者単位で返るため、判定と表示は表示キャラのものだけに絞る
  const notificationEvents = allUserEvents.filter((e) => e.characterId === characterId);
  const userMessages = recentMessages.filter((m) => m.role === 'user');

  const bedtime = lifecycle?.bedtime ?? LIFECYCLE_DEFAULT_BEDTIME;
  const wakeUpTime = lifecycle?.wakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME;

  const lifecycleForDecision = lifecycle ?? {
    userId,
    characterId,
    bedtime,
    wakeUpTime,
    createdAt: 0,
    updatedAt: 0,
  };

  const notifyDecision = shouldNotifyNow({
    userMessages,
    lifecycle: lifecycleForDecision,
    notificationEvents,
    now,
  });

  const nextEarliestAt =
    !notifyDecision.notify && notifyDecision.reason === 'not_due'
      ? computeNextEarliestAt(userMessages, notificationEvents, now)
      : undefined;

  return {
    lifecycle: {
      state: resolveLifecycleState(now, bedtime, wakeUpTime),
      bedtime,
      wakeUpTime,
      userActivityProfile: lifecycle?.userActivityProfile ?? null,
    },
    recentNotifications: notificationEvents.slice(0, RECENT_NOTIFICATION_COUNT),
    notifyDecision,
    ...(nextEarliestAt !== undefined ? { nextEarliestAt } : {}),
    studyTopicPendingCount: studyPending.length,
  };
}
