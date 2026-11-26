import {
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
  NOTIFY_EVENT_READ_LIMIT,
  NOTIFY_TOPIC_HEADER_READ_LIMIT,
  STUDY_DAILY_RESEARCH_LIMIT_PER_USER,
  STUDY_PAUSE_AFTER_HOURS,
  computeNextEarliestAt,
  computePerCharacterResearchLimit,
  createFreshnessCheckRequestRepository,
  createLifecycleRepository,
  createMessageRepository,
  createNotificationEventRepository,
  createStudyTopicRepository,
  createStudyUsageRepository,
  createTopicRepository,
  findLastUserMessageAt,
  getAllCharacterIds,
  getCharacterDefinitionById,
  isStudyPaused,
  partitionCriticalCandidates,
  resolveLastUserMessageAt,
  resolveLifecycleState,
  resolveNotifyMessageSinceMs,
  selectCriticalCandidateTopics,
  shouldNotifyNow,
  toSentCriticals,
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
  /** 3 日ルール。止まっている間は勉強も話題を使う重要通知も止まる。 */
  studyPause: {
    paused: boolean;
    /** 直近 7 日の会話から求めた最後の発話の時刻。発話がなければ null。 */
    lastUserMessageAt: number | null;
    /** 勉強が止まる (止まった) 時刻。発話がなければ null。 */
    pausesAt: number | null;
  };
  /** 勉強の 1 日 (日本時間の暦日) の回数と上限。 */
  studyUsage: {
    characterCount: number;
    totalCount: number;
    characterLimit: number;
    totalLimit: number;
    studyingCharacterCount: number;
    /** キャラ別か合計のどちらかの上限に達していて、勉強が止まっている。 */
    limitReached: boolean;
  };
  /** 話題を使ったことで記録された、鮮度確認の依頼の待ち。 */
  freshnessCheckRequests: {
    count: number;
    requests: { topicId: string; createdAt: number }[];
  };
  /** 重要通知の判定 (LLM) に渡る手前の状態。LLM は呼ばない。 */
  criticalCandidates: {
    /** 勉強が止まっているときは話題を使わないため判定しない (false)。 */
    evaluated: boolean;
    candidates: CriticalTopicSummary[];
    /** 確認が要る WEB fact を持つため判定の候補から外れた話題。 */
    staleExcluded: CriticalTopicSummary[];
    /** 送り済みの重要通知。同じ話題・予定は再び選ばれない。 */
    sentCriticals: { topicId: string; eventDate: string | null }[];
  };
}

/** 判定の候補の表示用の要約。WEB fact の中身は含めない。 */
export interface CriticalTopicSummary {
  topicId: string;
  subject: string;
  care: number;
}

const HOUR_MS = 60 * 60 * 1000;

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

  const lastUserMessageAt = findLastUserMessageAt(userMessages);
  const studyPaused = isStudyPaused(lastUserMessageAt, now);

  const [studyUsage, freshnessRequests, criticalCandidates] = await Promise.all([
    loadStudyUsage(userId, characterId, now),
    createFreshnessCheckRequestRepository().listByCharacter(userId, characterId),
    loadCriticalCandidates(userId, characterId, studyPaused, notificationEvents, now),
  ]);

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
    studyPause: {
      paused: studyPaused,
      lastUserMessageAt: lastUserMessageAt ?? null,
      pausesAt:
        lastUserMessageAt !== undefined
          ? lastUserMessageAt + STUDY_PAUSE_AFTER_HOURS * HOUR_MS
          : null,
    },
    studyUsage,
    freshnessCheckRequests: {
      count: freshnessRequests.length,
      requests: freshnessRequests.map((r) => ({ topicId: r.topicId, createdAt: r.createdAt })),
    },
    criticalCandidates,
  };
}

/**
 * 勉強の日次の回数と上限を読む。
 *
 * キャラ別の上限は取得バッチと同じく、lifecycle があり 3 日ルールで止まっていないキャラの数で
 * 合計の上限を等分して決める。日付の区切りは readUsage が日本時間の暦日で持つため、ここでは計算しない。
 */
async function loadStudyUsage(
  userId: string,
  characterId: string,
  now: Date
): Promise<StatusSnapshot['studyUsage']> {
  const lifecycleRepo = createLifecycleRepository();
  const messageRepo = createMessageRepository();

  const studyingFlags = await Promise.all(
    getAllCharacterIds().map(async (id) => {
      // バッチは定義のないキャラを数えない
      if (!getCharacterDefinitionById(id)) return false;
      if (!(await lifecycleRepo.get({ userId, characterId: id }))) return false;
      const last = await resolveLastUserMessageAt(messageRepo, userId, id, now);
      return !isStudyPaused(last, now);
    })
  );
  const studyingCharacterCount = studyingFlags.filter(Boolean).length;
  const characterLimit = computePerCharacterResearchLimit(studyingCharacterCount);
  const totalLimit = STUDY_DAILY_RESEARCH_LIMIT_PER_USER;

  const { characterCount, totalCount } = await createStudyUsageRepository().readUsage({
    userId,
    characterId,
    nowMs: now.getTime(),
  });

  return {
    characterCount,
    totalCount,
    characterLimit,
    totalLimit,
    studyingCharacterCount,
    limitReached: characterCount >= characterLimit || totalCount >= totalLimit,
  };
}

/**
 * 重要通知の判定に渡る候補を、LLM を呼ばずに求める。
 *
 * 通知バッチと同じ順・同じ関数で絞るが、鮮度確認の依頼は書かない。
 * 勉強が止まっているときは話題を使わないため、Topic も読まない。
 */
async function loadCriticalCandidates(
  userId: string,
  characterId: string,
  studyPaused: boolean,
  notificationEvents: NotificationEventEntity[],
  now: Date
): Promise<StatusSnapshot['criticalCandidates']> {
  const sentCriticals = toSentCriticals(notificationEvents).map((s) => ({
    topicId: s.topicId,
    eventDate: s.eventDate ?? null,
  }));
  if (studyPaused) {
    return { evaluated: false, candidates: [], staleExcluded: [], sentCriticals };
  }

  const topicRepo = createTopicRepository();
  const topics = await topicRepo.listTopicHeadersByCareDesc(
    userId,
    characterId,
    NOTIFY_TOPIC_HEADER_READ_LIMIT
  );
  const readCandidates = await Promise.all(
    selectCriticalCandidateTopics(topics).map(async (topic) => ({
      topic,
      webFacts: await topicRepo.listWebFacts(userId, characterId, topic.topicId),
    }))
  );
  const { candidates, staleExcluded } = partitionCriticalCandidates(readCandidates, now.getTime());
  const summarize = ({ topic }: { topic: CriticalTopicSummary }): CriticalTopicSummary => ({
    topicId: topic.topicId,
    subject: topic.subject,
    care: topic.care,
  });
  return {
    evaluated: true,
    candidates: candidates.map(summarize),
    staleExcluded: staleExcluded.map(summarize),
    sentCriticals,
  };
}
