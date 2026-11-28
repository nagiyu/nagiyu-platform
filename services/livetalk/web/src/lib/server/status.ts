import {
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
  NOTIFY_EVENT_READ_LIMIT,
  NOTIFY_TOPIC_HEADER_READ_LIMIT,
  STUDY_PAUSE_AFTER_HOURS,
  computeNextEarliestAt,
  computePerCharacterResearchLimit,
  createFreshnessCheckRequestRepository,
  createLifecycleRepository,
  createMessageRepository,
  createNotificationEventRepository,
  createPushSubscriptionRepository,
  createStudyTopicRepository,
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
  shouldAcquireNow,
  shouldNotifyNow,
  toSentCriticals,
  type LifecycleEntity,
  type NotificationEventEntity,
  type NotifyDecision,
} from '@nagiyu/livetalk-core';
import type { AdminStudyStatus } from '@/lib/study/admin-study-status';

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
  /**
   * 勉強がいま止まっている理由の要約。取得バッチが判定する順
   * (1 日の上限が 0、生活サイクル、3 日ルール、就寝、回数の上限) で、最初に当たったものを返す。
   * 止まっていなければ studying。
   */
  studyState: StudyState;
  /** 3 日ルール。止まっている間は勉強も話題を使う重要通知も止まる。 */
  studyPause: {
    paused: boolean;
    /** 直近 7 日の会話から求めた最後の発話の時刻。発話がなければ null。 */
    lastUserMessageAt: number | null;
    /** 勉強が止まる (止まった) 時刻。発話がなければ null。 */
    pausesAt: number | null;
  };
  /**
   * 表示キャラクターの勉強の 1 日 (日本時間の暦日) の回数と上限。
   * 利用者の合計と全利用者の合計は、勉強の節 (`study`) が持つ。
   */
  studyUsage: {
    characterCount: number;
    characterLimit: number;
    studyingCharacterCount: number;
    /** 回数の上限に達した枠。狭い順 (キャラ別、利用者の合計、全利用者の合計) で最初に当たったもの。達していなければ null。 */
    limitReachedBy: StudyLimitScope | null;
    /** いずれかの枠の上限に達していて、勉強が止まっている。 */
    limitReached: boolean;
  };
  /** 話題を使ったことで記録された、鮮度確認の依頼の待ち。 */
  freshnessCheckRequests: {
    count: number;
    requests: { topicId: string; createdAt: number }[];
  };
  /** 重要通知の判定 (LLM) に渡る手前の状態。LLM は呼ばない。 */
  criticalCandidates: {
    /** 通知バッチがこのキャラの重要通知を判定するか。 */
    evaluated: boolean;
    /** 判定しない理由。判定するときは null。 */
    skipReason: CriticalSkipReason | null;
    candidates: CriticalTopicSummary[];
    /** 確認が要る WEB fact を持つため判定の候補から外れた話題。 */
    staleExcluded: CriticalTopicSummary[];
    /** 送り済みの重要通知。同じ話題・予定は再び選ばれない。 */
    sentCriticals: { topicId: string; eventDate: string | null }[];
  };
}

/** 回数の上限の枠。数える順 (狭い順) と同じ */
export type StudyLimitScope = 'character' | 'user' | 'global';

/**
 * 勉強が止まっている理由。
 * - trial_ended: 1 日の上限が 0 (無料でお試しが終わった、または始まっていない) で、取得バッチの対象外
 * - no_lifecycle: 生活サイクルが未登録で、取得バッチの対象外
 * - paused: 3 日ルールで止まっている
 * - sleeping: キャラが就寝中で、起床後に勉強する
 * - limit_reached: その日の回数の上限に達している
 */
export type StudyState =
  'trial_ended' | 'no_lifecycle' | 'paused' | 'sleeping' | 'limit_reached' | 'studying';

/**
 * 重要通知を判定しない理由。通知バッチは購読のない利用者をキャラを見る前に飛ばし、
 * 生活サイクルが未登録のキャラは対象外で、勉強が止まっているキャラは話題を使わないため判定しない。
 */
export type CriticalSkipReason = 'no_subscription' | 'no_lifecycle' | 'study_paused';

/** 判定の候補の表示用の要約。WEB fact の中身は含めない。 */
export interface CriticalTopicSummary {
  topicId: string;
  subject: string;
  care: number;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * 勉強の状態の計算に渡す、勉強の節と表示キャラクターの回数。
 * 区分・お試しの 1 日の上限と、利用者・全利用者の合計の回数は、勉強の節と同じ値を使う (読み取りを二重にしない)。
 */
export interface StatusStudyInput {
  study: AdminStudyStatus;
  /** 表示キャラクターの今日の回数 */
  characterCount: number;
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
  now: Date,
  studyInput: StatusStudyInput
): Promise<StatusSnapshot> {
  const [lifecycle, allUserEvents, recentMessages, studyPending, subscriptions] = await Promise.all(
    [
      createLifecycleRepository().get({ userId, characterId }),
      createNotificationEventRepository().listByUser(userId, NOTIFY_EVENT_READ_LIMIT),
      createMessageRepository().listSince(userId, characterId, resolveNotifyMessageSinceMs(now)),
      createStudyTopicRepository().listByStatus(userId, characterId, 'pending'),
      createPushSubscriptionRepository().listByUser(userId),
    ]
  );

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
    loadStudyUsage(userId, characterId, now, studyInput),
    createFreshnessCheckRequestRepository().listByCharacter(userId, characterId),
    loadCriticalCandidates(
      userId,
      characterId,
      // 通知バッチの判定順 (購読、生活サイクル、勉強停止) と同じにする
      subscriptions.length === 0
        ? 'no_subscription'
        : lifecycle === null
          ? 'no_lifecycle'
          : studyPaused
            ? 'study_paused'
            : null,
      notificationEvents,
      now
    ),
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
    studyState:
      // 取得バッチは 1 日の上限が 0 の利用者を、キャラクターを見る前に飛ばす
      studyInput.study.user.limit === 0
        ? 'trial_ended'
        : lifecycle === null
          ? 'no_lifecycle'
          : studyPaused
            ? 'paused'
            : !shouldAcquireNow(lifecycle, now).awake
              ? 'sleeping'
              : studyUsage.limitReached
                ? 'limit_reached'
                : 'studying',
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
 * 勉強の日次の回数と上限を求める。
 *
 * キャラ別の上限は取得バッチと同じく、利用者の 1 日の上限 (区分とお試しで決まる) を、
 * lifecycle があり 3 日ルールで止まっていないキャラの数で等分して決める。
 * 利用者の合計と全利用者の合計の上限と回数は、勉強の節が数えるのと同じ値を使う。
 */
async function loadStudyUsage(
  userId: string,
  characterId: string,
  now: Date,
  { study, characterCount }: StatusStudyInput
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
  const characterLimit = computePerCharacterResearchLimit(studyingCharacterCount, study.user.limit);

  // 数える順 (狭い順) に最初に当たった枠を返す
  const limitReachedBy: StudyLimitScope | null =
    characterCount >= characterLimit
      ? 'character'
      : study.user.reached
        ? 'user'
        : study.global.reached
          ? 'global'
          : null;

  return {
    characterCount,
    characterLimit,
    studyingCharacterCount,
    limitReachedBy,
    limitReached: limitReachedBy !== null,
  };
}

/**
 * 重要通知の判定に渡る候補を、LLM を呼ばずに求める。
 *
 * 通知バッチと同じ順・同じ関数で絞るが、鮮度確認の依頼は書かない。
 * 判定しないとき (skipReason がある) は、バッチも話題を使わないため Topic も読まない。
 */
async function loadCriticalCandidates(
  userId: string,
  characterId: string,
  skipReason: CriticalSkipReason | null,
  notificationEvents: NotificationEventEntity[],
  now: Date
): Promise<StatusSnapshot['criticalCandidates']> {
  const sentCriticals = toSentCriticals(notificationEvents).map((s) => ({
    topicId: s.topicId,
    eventDate: s.eventDate ?? null,
  }));
  if (skipReason !== null) {
    return { evaluated: false, skipReason, candidates: [], staleExcluded: [], sentCriticals };
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
    skipReason: null,
    candidates: candidates.map(summarize),
    staleExcluded: staleExcluded.map(summarize),
    sentCriticals,
  };
}
