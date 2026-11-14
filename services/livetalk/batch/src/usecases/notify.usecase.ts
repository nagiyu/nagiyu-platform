import { logger, toErrorMessage } from '@nagiyu/common';
import { sendWebPushNotifications, getVapidConfig } from '@nagiyu/common/push';
import {
  DEFAULT_CHARACTER_ID,
  buildCriticalNotificationMessage,
  buildNotificationMessage,
  buildSuggestedReply,
  detectCriticalTopic,
  shouldNotifyNow,
  getAllCharacterIds,
  isStudyPaused,
  findLastUserMessageAt,
  getCharacterDefinitionById,
  hasStaleWebFact,
  requestFreshnessChecks,
  selectNotificationsToSend,
  computeIntensityFactor,
  computeDailyNormalCap,
  extractSessionStartTimes,
  type NotificationEventEntity,
  type ILLMClient,
  type FreshnessCheckRequestRepository,
  type LifecycleRepository,
  type MessageRepository,
  type NotificationEventRepository,
  type ProfileRepository,
  type PushSubscriptionRepository,
  type TopicEntity,
  type WebFactEntity,
  type TopicRepository,
  type UlidFactory,
  defaultUlidFactory,
  NOTIFICATION_EVENT_TTL_SECONDS,
  NOTIFY_CRITICAL_CARE_THRESHOLD,
  NOTIFY_INTENSITY_WINDOW_DAYS,
  NOTIFY_SESSION_GAP_MINUTES,
} from '@nagiyu/livetalk-core';

/**
 * critical 判定用に care 上位から絞り込む Topic 候補数（LLM コスト抑制）。
 */
const CRITICAL_CANDIDATE_TOPIC_LIMIT = 3;

export interface NotifyAllUsersParams {
  profileRepo: ProfileRepository;
  lifecycleRepo: LifecycleRepository;
  messageRepo: MessageRepository;
  topicRepo: TopicRepository;
  pushSubscriptionRepo: PushSubscriptionRepository;
  notifEventRepo: NotificationEventRepository;
  freshnessCheckRequestRepo: FreshnessCheckRequestRepository;
  llmClient: ILLMClient;
  ulidFactory?: UlidFactory;
  now?: () => Date;
}

export interface NotifyAllUsersResult {
  notifiedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
}

/**
 * 全アクティブユーザーへのプッシュ通知を送信する。
 *
 * ProfileRepository（GSI1）でユーザーを列挙し、
 * 各ユーザーについて全キャラクターの通知判定を行う。
 */
export async function notifyAllUsers(params: NotifyAllUsersParams): Promise<NotifyAllUsersResult> {
  const {
    profileRepo,
    lifecycleRepo,
    messageRepo,
    topicRepo,
    pushSubscriptionRepo,
    notifEventRepo,
    freshnessCheckRequestRepo,
    llmClient,
    ulidFactory = defaultUlidFactory,
    now = () => new Date(),
  } = params;

  const userIds = await profileRepo.listAllUserIds();
  logger.info('[notifyAllUsers] ユーザー一覧取得完了', { userCount: userIds.length });

  const result: NotifyAllUsersResult = {
    notifiedUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    failedUserIds: [],
  };

  const vapidConfig = getVapidConfig();

  for (const userId of userIds) {
    try {
      const notified = await processUser({
        userId,
        lifecycleRepo,
        messageRepo,
        topicRepo,
        pushSubscriptionRepo,
        notifEventRepo,
        freshnessCheckRequestRepo,
        llmClient,
        ulidFactory,
        vapidConfig,
        now,
      });

      if (notified) {
        result.notifiedUsers++;
      } else {
        result.skippedUsers++;
      }
    } catch (error) {
      logger.error('[notifyAllUsers] ユーザー処理失敗', {
        userId,
        error: toErrorMessage(error),
      });
      result.failedUsers++;
      result.failedUserIds.push(userId);
    }
  }

  logger.info('[notifyAllUsers] 全ユーザー処理完了', { ...result });
  return result;
}

interface ProcessUserParams {
  userId: string;
  lifecycleRepo: LifecycleRepository;
  messageRepo: MessageRepository;
  topicRepo: TopicRepository;
  pushSubscriptionRepo: PushSubscriptionRepository;
  notifEventRepo: NotificationEventRepository;
  freshnessCheckRequestRepo: FreshnessCheckRequestRepository;
  llmClient: ILLMClient;
  ulidFactory: UlidFactory;
  vapidConfig: ReturnType<typeof getVapidConfig>;
  now: () => Date;
}

/** キャラ単位の通知候補 */
interface NotificationCandidate {
  characterId: string;
  kind: 'normal' | 'critical';
  topicId: string | undefined;
  /** 重要通知の根拠にした予定の日付。送り済みの照合のため通知の記録に残す */
  eventDate: string | undefined;
  title: string;
  body: string;
  /** 通知タップ起動時に入力欄へプリフィルするユーザー発話 */
  suggestedReply: string;
  /**
   * そのキャラの直近 normal 通知の CreatedAt（未通知は 0）。
   * normal 候補の選抜（公平性ソート）に使用する。
   */
  lastNormalAt: number;
}

async function processUser(params: ProcessUserParams): Promise<boolean> {
  const {
    userId,
    lifecycleRepo,
    messageRepo,
    topicRepo,
    pushSubscriptionRepo,
    notifEventRepo,
    freshnessCheckRequestRepo,
    llmClient,
    ulidFactory,
    vapidConfig,
    now,
  } = params;

  const currentNow = now();

  // プッシュサブスクリプション未登録はスキップ（全キャラ走査前に確認してコストを節約）
  const subscriptions = await pushSubscriptionRepo.listByUser(userId);
  if (subscriptions.length === 0) return false;

  // ユーザー全キャラの通知履歴を一括取得（直近 60 件）
  // 総量調停（userDailyNormalCap チェック）はここで取得した全履歴を使う
  const allUserEvents = await notifEventRepo.listByUser(userId, 60);

  // 全キャラを走査して発火候補を収集する
  const criticalCandidates: { characterId: string }[] = [];
  const normalCandidates: { characterId: string; lastNormalAt: number }[] = [];
  // characterId → 候補の詳細（文面・topicId）
  const candidateMap = new Map<string, NotificationCandidate>();

  const allCharacterIds = getAllCharacterIds();

  for (const characterId of allCharacterIds) {
    try {
      const candidateOrNull = await evaluateCharacter({
        userId,
        characterId,
        lifecycleRepo,
        messageRepo,
        topicRepo,
        freshnessCheckRequestRepo,
        llmClient,
        allUserEvents,
        now: currentNow,
      });

      if (candidateOrNull === null) continue;

      candidateMap.set(characterId, candidateOrNull);

      if (candidateOrNull.kind === 'critical') {
        criticalCandidates.push({ characterId });
      } else {
        normalCandidates.push({
          characterId,
          lastNormalAt: candidateOrNull.lastNormalAt,
        });
      }
    } catch (error) {
      logger.warn('[notifyAllUsers] キャラ単位評価失敗（スキップ）', {
        userId,
        characterId,
        error: toErrorMessage(error),
      });
    }
  }

  if (criticalCandidates.length === 0 && normalCandidates.length === 0) {
    logger.info('[notifyAllUsers] 全キャラ通知なし', { userId });
    return false;
  }

  // ユーザー全体の intensityFactor は「最も活発なキャラ」のものを使う
  // （活発なキャラがいれば上限を引き上げるべきため）
  const userDailyNormalCap = await computeUserDailyNormalCap({
    userId,
    allCharacterIds,
    messageRepo,
    now: currentNow,
  });

  // B-3: ユーザー総量調停（純粋関数）
  const { criticalCharacterIds, normalCharacterId } = selectNotificationsToSend({
    criticalCandidates,
    normalCandidates,
    allUserEvents,
    now: currentNow,
    userDailyNormalCap,
  });

  // 実際に送る characterId セットを決定する
  const toSendCharacterIds = new Set<string>([
    ...criticalCharacterIds,
    ...(normalCharacterId !== null ? [normalCharacterId] : []),
  ]);

  if (toSendCharacterIds.size === 0) {
    logger.info('[notifyAllUsers] 総量調停後に送信なし', { userId });
    return false;
  }

  const expiresAt = currentNow.getTime() + NOTIFICATION_EVENT_TTL_SECONDS * 1000;
  let anySent = false;

  // 送ると決まった各通知について push 送信 → 履歴記録
  for (const characterId of toSendCharacterIds) {
    const candidate = candidateMap.get(characterId);
    if (!candidate) continue;

    const { title, body, topicId, eventDate, kind, suggestedReply } = candidate;

    // B-2: payload に characterId と URL を含める（from=push で通知タップ由来であることをフロントに伝える）
    const payload = {
      title,
      body,
      data: { url: `/?character=${characterId}&from=push`, characterId },
    };

    // 全サブスクリプションに送信（失敗はログのみ、無効は削除）
    const result = await sendWebPushNotifications(
      subscriptions,
      (sub) => ({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dhKey, auth: sub.authKey } }),
      payload,
      vapidConfig
    );

    // 無効なサブスクリプション（404/410）を削除する。削除の失敗で配信履歴の記録を止めないよう継続する
    for (const sub of result.invalid) {
      try {
        await pushSubscriptionRepo.delete({ userId, subscriptionId: sub.subscriptionId });
      } catch (error) {
        logger.warn('[notifyAllUsers] 無効なサブスクリプションの削除失敗（継続）', {
          userId,
          characterId,
          subscriptionId: sub.subscriptionId,
          error: toErrorMessage(error),
        });
      }
    }

    for (const { target, error } of result.failed) {
      logger.warn('[notifyAllUsers] Push 送信失敗（継続）', {
        userId,
        characterId,
        subscriptionId: target.subscriptionId,
        error: toErrorMessage(error),
      });
    }

    const sentCount = result.sent.length;
    if (sentCount === 0) continue;

    // 配信履歴を記録（CharacterID・SuggestedReply を付与）
    await notifEventRepo.put({
      userId,
      notifId: ulidFactory(),
      characterId,
      kind,
      title,
      body,
      topicId,
      ...(eventDate !== undefined && { eventDate }),
      suggestedReply,
      expiresAt,
    });

    anySent = true;
  }

  return anySent;
}

/**
 * 1 キャラについて発火判定を行い、候補を返す。
 * 発火しない場合は null を返す。
 */
async function evaluateCharacter(params: {
  userId: string;
  characterId: string;
  lifecycleRepo: LifecycleRepository;
  messageRepo: MessageRepository;
  topicRepo: TopicRepository;
  freshnessCheckRequestRepo: FreshnessCheckRequestRepository;
  llmClient: ILLMClient;
  /** ユーザー全キャラの通知履歴（characterId フィルタに使用） */
  allUserEvents: NotificationEventEntity[];
  now: Date;
}): Promise<NotificationCandidate | null> {
  const {
    userId,
    characterId,
    lifecycleRepo,
    messageRepo,
    topicRepo,
    freshnessCheckRequestRepo,
    llmClient,
    allUserEvents,
    now,
  } = params;

  // ライフサイクル未登録のキャラはスキップ
  const lifecycle = await lifecycleRepo.get({ userId, characterId });
  if (!lifecycle) return null;

  // このキャラの CharacterDefinition を取得（通知名に使用）
  const characterDef = getCharacterDefinitionById(characterId);
  // notificationName が無い場合は DEFAULT_CHARACTER_ID のフォールバック名を使う
  const characterNotificationName =
    characterDef?.notificationName ??
    getCharacterDefinitionById(DEFAULT_CHARACTER_ID)?.notificationName ??
    'ひより';

  // 直近 NOTIFY_INTENSITY_WINDOW_DAYS 日のメッセージを時刻範囲で取得（強度サンプリング用）
  const intensityWindowMs = NOTIFY_INTENSITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const sinceMs = now.getTime() - intensityWindowMs;
  const recentMessages = await messageRepo.listSince(userId, characterId, sinceMs);
  const userMessages = recentMessages.filter((m) => m.role === 'user');

  // 通知履歴をこのキャラ単位でフィルタ（他キャラの通知が interval/cap/missedCount に混入しない）
  const charNotifEvents = allUserEvents.filter((e) => e.characterId === characterId);

  // 勉強が止まっている組は話題を使わない。止まると情報が更新されず、延期や中止を拾えないまま
  // 「もうすぐある」と重要通知しうるうえ、話題入りの文面は勉強したことを前提にしているため。
  // 強度サンプリングの窓 (7 日) は停止期間 (3 日) を含むので、その読み取りで最後の発話を求められる。
  const studyPaused = isStudyPaused(findLastUserMessageAt(userMessages), now);

  // care 降順で Topic ヘッダを取得（ネタ源・critical 判定の候補）。止まっている間は使わない。
  const topics = studyPaused
    ? []
    : await topicRepo.listTopicHeadersByCareDesc(userId, characterId, 10);

  // critical 判定用に「高 care」の Topic のみ上位から WEB fact を取得する。
  // care 閾値未満は detectCriticalTopic 側でも LLM をスキップするため、
  // ここで先に絞り込んで無駄な listWebFacts（DynamoDB Query）を避ける。
  const criticalCandidateTopics = topics
    .filter((t) => t.care >= NOTIFY_CRITICAL_CARE_THRESHOLD)
    .slice(0, CRITICAL_CANDIDATE_TOPIC_LIMIT);
  const readCriticalCandidates = await Promise.all(
    criticalCandidateTopics.map(async (topic) => ({
      topic,
      webFacts: await topicRepo.listWebFacts(userId, characterId, topic.topicId),
    }))
  );

  // 判定の候補になった Topic は使われたとみなし、確認が要る WEB fact があれば確認を依頼する。
  // 確認が済むまでは、延期や中止を拾えないまま「もうすぐある」と重要通知しうるので判定の候補から外す。
  // NextReview が前進すれば、次の回で再び候補になる。
  await requestFreshnessChecks({
    repository: freshnessCheckRequestRepo,
    userId,
    characterId,
    topics: readCriticalCandidates.map(({ topic, webFacts }) => ({
      topicId: topic.topicId,
      webFacts,
    })),
    nowMs: now.getTime(),
  });
  const criticalCandidates = readCriticalCandidates.filter(
    ({ webFacts }) => !hasStaleWebFact(webFacts, now.getTime())
  );

  // 送り済みの重要通知は、同じ話題・同じ予定を再び選ばないよう判定へ渡す。
  // 予定の日付が記録に無い旧データは、判定側で話題ごと送り済みとして扱われる。
  const sentCriticals = charNotifEvents
    .filter((e) => e.kind === 'critical' && e.topicId !== undefined)
    .map((e) => ({ topicId: e.topicId as string, eventDate: e.eventDate }));

  // topics が空なら候補も空になり、LLM は呼ばれず critical は発火しない。
  const escalation = await detectCriticalTopic({
    candidates: criticalCandidates,
    careThreshold: NOTIFY_CRITICAL_CARE_THRESHOLD,
    llmClient,
    now,
    sentCriticals,
  });
  const criticalTopicId = escalation.isCritical ? (escalation.topicId ?? undefined) : undefined;

  // 発火判定（このキャラの履歴のみで判定）
  const decision = shouldNotifyNow({
    userMessages,
    lifecycle,
    notificationEvents: charNotifEvents,
    criticalTopicId,
    now,
  });

  if (!decision.notify) {
    logger.info('[notifyAllUsers] キャラ通知スキップ', {
      userId,
      characterId,
      reason: decision.reason,
    });
    return null;
  }

  // このキャラの直近 normal 通知時刻（総量調停の公平性選抜に使用）
  const lastNormalEvent = charNotifEvents.find((e) => e.kind === 'normal');
  const lastNormalAt = lastNormalEvent?.createdAt ?? 0;

  // 通知文面生成
  let title: string;
  let body: string;
  let topicId: string | undefined;
  let eventDate: string | undefined;
  let suggestedReply: string;

  if (decision.kind === 'critical') {
    const topic = topics.find((t) => t.topicId === decision.topicId);
    const msg = buildCriticalNotificationMessage(
      topic?.subject ?? '大事なこと',
      characterNotificationName
    );
    title = msg.title;
    body = msg.body;
    topicId = decision.topicId;
    eventDate =
      escalation.topicId === decision.topicId ? (escalation.eventDate ?? undefined) : undefined;
    suggestedReply = buildSuggestedReply(topic?.subject);
  } else {
    // 直近で使用済みの TopicID を避けてネタを選ぶ（同じ話題の連発を抑制）
    // このキャラの履歴から使用済み TopicID を収集する
    const usedTopicIds = new Set(
      charNotifEvents
        .map((e) => e.topicId)
        .filter((id: string | undefined): id is string => id !== undefined)
    );
    // 未使用の care 最上位を選ぶ。無ければ care 最上位（無条件）にフォールバック。
    // Topic が皆無なら freshTopic は undefined のまま（Topic-less フォールバック）。
    const freshTopic: TopicEntity | undefined =
      topics.find((t) => !usedTopicIds.has(t.topicId)) ?? topics[0];
    const msg = buildNotificationMessage(
      {
        toneBucket: decision.toneBucket,
        knowledgeTopic: freshTopic?.subject,
        characterDisplayName: characterNotificationName,
      },
      now.getTime()
    );
    title = msg.title;
    body = msg.body;
    topicId = freshTopic?.topicId;
    suggestedReply = buildSuggestedReply(freshTopic?.subject);

    // ネタに使う Topic の確認を依頼する。通知は確認を待たずに送る (平常通知は延期や中止の影響が小さい)。
    // 重要通知の判定の候補だった Topic は、上で依頼済みなので読み直さない。
    if (freshTopic && !readCriticalCandidates.some((c) => c.topic.topicId === freshTopic.topicId)) {
      const webFacts = await readWebFactsForFreshness(
        topicRepo,
        userId,
        characterId,
        freshTopic.topicId
      );
      if (webFacts) {
        await requestFreshnessChecks({
          repository: freshnessCheckRequestRepo,
          userId,
          characterId,
          topics: [{ topicId: freshTopic.topicId, webFacts }],
          nowMs: now.getTime(),
        });
      }
    }
  }

  return {
    characterId,
    kind: decision.kind,
    topicId,
    eventDate,
    title,
    body,
    suggestedReply,
    lastNormalAt,
  };
}

/**
 * 鮮度の判定に使う Topic の WEB fact を読む。
 * 読み取りに失敗したら null を返す (通知を止めず、依頼は次に使われたときに回す)。
 */
async function readWebFactsForFreshness(
  topicRepo: TopicRepository,
  userId: string,
  characterId: string,
  topicId: string
): Promise<WebFactEntity[] | null> {
  try {
    return await topicRepo.listWebFacts(userId, characterId, topicId);
  } catch (error) {
    logger.warn('[notifyAllUsers] 鮮度確認のための WEB fact 読み取り失敗（スキップして継続）', {
      userId,
      characterId,
      topicId,
      error: toErrorMessage(error),
    });
    return null;
  }
}

/**
 * ユーザーの 1 日あたり通常通知上限を算出する。
 *
 * 全キャラの intensityFactor を計算し、最大値を computeDailyNormalCap に通す。
 * 活発なキャラがいれば上限を引き上げる（既存の体感頻度を壊さない）。
 * lifecycle 未登録のキャラは factor=1 として扱う。
 */
async function computeUserDailyNormalCap(params: {
  userId: string;
  allCharacterIds: string[];
  messageRepo: MessageRepository;
  now: Date;
}): Promise<number> {
  const { userId, allCharacterIds, messageRepo, now } = params;

  const sessionGapMs = NOTIFY_SESSION_GAP_MINUTES * 60 * 1000;
  const intensityWindowMs = NOTIFY_INTENSITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const sinceMs = now.getTime() - intensityWindowMs;

  let maxFactor = 1;

  for (const characterId of allCharacterIds) {
    try {
      const messages = await messageRepo.listSince(userId, characterId, sinceMs);
      const userMessages = messages.filter((m) => m.role === 'user');
      const sessionStarts = extractSessionStartTimes(userMessages, sessionGapMs);
      const factor = computeIntensityFactor(sessionStarts, now);
      if (factor > maxFactor) {
        maxFactor = factor;
      }
    } catch {
      // 取得失敗は factor=1 として継続
    }
  }

  return computeDailyNormalCap(maxFactor);
}
