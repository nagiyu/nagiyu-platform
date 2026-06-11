import { logger, toErrorMessage } from '@nagiyu/common';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import {
  DEFAULT_CHARACTER_ID,
  buildCriticalNotificationMessage,
  buildNotificationMessage,
  detectCriticalKnowledge,
  shouldNotifyNow,
  getAllCharacterIds,
  getCharacterDefinitionById,
  selectNotificationsToSend,
  computeIntensityFactor,
  computeDailyNormalCap,
  extractSessionStartTimes,
  type NotificationEventEntity,
  type IEmbeddingClient,
  type ILLMClient,
  type InterestRepository,
  type KnowledgeRepository,
  type LifecycleRepository,
  type MessageRepository,
  type NotificationEventRepository,
  type ProfileRepository,
  type PushSubscriptionRepository,
  type UlidFactory,
  defaultUlidFactory,
  NOTIFICATION_EVENT_TTL_SECONDS,
  NOTIFY_INTENSITY_WINDOW_DAYS,
  NOTIFY_SESSION_GAP_MINUTES,
} from '@nagiyu/livetalk-core';

export interface NotifyAllUsersParams {
  profileRepo: ProfileRepository;
  lifecycleRepo: LifecycleRepository;
  messageRepo: MessageRepository;
  knowledgeRepo: KnowledgeRepository;
  pushSubscriptionRepo: PushSubscriptionRepository;
  notifEventRepo: NotificationEventRepository;
  interestRepo: InterestRepository;
  llmClient: ILLMClient;
  embeddingClient: IEmbeddingClient;
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
    knowledgeRepo,
    pushSubscriptionRepo,
    notifEventRepo,
    interestRepo,
    llmClient,
    embeddingClient,
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
        knowledgeRepo,
        pushSubscriptionRepo,
        notifEventRepo,
        interestRepo,
        llmClient,
        embeddingClient,
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
  knowledgeRepo: KnowledgeRepository;
  pushSubscriptionRepo: PushSubscriptionRepository;
  notifEventRepo: NotificationEventRepository;
  interestRepo: InterestRepository;
  llmClient: ILLMClient;
  embeddingClient: IEmbeddingClient;
  ulidFactory: UlidFactory;
  vapidConfig: ReturnType<typeof getVapidConfig>;
  now: () => Date;
}

/** キャラ単位の通知候補 */
interface NotificationCandidate {
  characterId: string;
  kind: 'normal' | 'critical';
  knowledgeId: string | undefined;
  title: string;
  body: string;
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
    knowledgeRepo,
    pushSubscriptionRepo,
    notifEventRepo,
    interestRepo,
    llmClient,
    embeddingClient,
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
  // characterId → 候補の詳細（文面・knowledgeId）
  const candidateMap = new Map<string, NotificationCandidate>();

  const allCharacterIds = getAllCharacterIds();

  for (const characterId of allCharacterIds) {
    try {
      const candidateOrNull = await evaluateCharacter({
        userId,
        characterId,
        lifecycleRepo,
        messageRepo,
        knowledgeRepo,
        interestRepo,
        llmClient,
        embeddingClient,
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

  const ttl = Math.floor(currentNow.getTime() / 1000) + NOTIFICATION_EVENT_TTL_SECONDS;
  let anySent = false;

  // 送ると決まった各通知について push 送信 → 履歴記録
  for (const characterId of toSendCharacterIds) {
    const candidate = candidateMap.get(characterId);
    if (!candidate) continue;

    const { title, body, knowledgeId, kind } = candidate;

    // B-2: payload に characterId と URL を含める
    const payload = {
      title,
      body,
      data: { url: `/?character=${characterId}`, characterId },
    };

    // 全サブスクリプションに送信（失敗はログのみ、無効は削除）
    let sentCount = 0;
    for (const sub of subscriptions) {
      try {
        const sent = await sendWebPushNotification(
          { endpoint: sub.Endpoint, keys: { p256dh: sub.P256dhKey, auth: sub.AuthKey } },
          payload,
          vapidConfig
        );
        if (sent) {
          sentCount++;
        } else {
          // 無効なサブスクリプション（404/410）を削除
          await pushSubscriptionRepo.delete({ userId, subscriptionId: sub.SubscriptionID });
        }
      } catch (error) {
        logger.warn('[notifyAllUsers] Push 送信失敗（継続）', {
          userId,
          characterId,
          subscriptionId: sub.SubscriptionID,
          error: toErrorMessage(error),
        });
      }
    }

    if (sentCount === 0) continue;

    // 配信履歴を記録（CharacterID を付与）
    await notifEventRepo.put({
      UserID: userId,
      NotifID: ulidFactory(),
      CharacterID: characterId,
      Kind: kind,
      Title: title,
      Body: body,
      KnowledgeID: knowledgeId,
      Ttl: ttl,
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
  knowledgeRepo: KnowledgeRepository;
  interestRepo: InterestRepository;
  llmClient: ILLMClient;
  embeddingClient: IEmbeddingClient;
  /** ユーザー全キャラの通知履歴（characterId フィルタに使用） */
  allUserEvents: NotificationEventEntity[];
  now: Date;
}): Promise<NotificationCandidate | null> {
  const {
    userId,
    characterId,
    lifecycleRepo,
    messageRepo,
    knowledgeRepo,
    interestRepo,
    llmClient,
    embeddingClient,
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
  const userMessages = recentMessages.filter((m) => m.Role === 'user');

  // 通知履歴をこのキャラ単位でフィルタ（他キャラの通知が interval/cap/missedCount に混入しない）
  const charNotifEvents = allUserEvents.filter((e) => e.CharacterID === characterId);

  // クリティカル候補を取得して LLM 判定
  const recentKnowledge = await knowledgeRepo.list(userId, characterId, 10);
  const interestCategories = await interestRepo.list(userId, characterId);
  const escalation = await detectCriticalKnowledge({
    knowledgeList: recentKnowledge,
    interestCategories,
    llmClient,
    embeddingClient,
    now,
  });
  const criticalKnowledgeId = escalation.isCritical
    ? (escalation.knowledgeId ?? undefined)
    : undefined;

  // 発火判定（このキャラの履歴のみで判定）
  const decision = shouldNotifyNow({
    userMessages,
    lifecycle,
    notificationEvents: charNotifEvents,
    criticalKnowledgeId,
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
  const lastNormalEvent = charNotifEvents.find((e) => e.Kind === 'normal');
  const lastNormalAt = lastNormalEvent?.CreatedAt ?? 0;

  // 通知文面生成
  let title: string;
  let body: string;
  let knowledgeId: string | undefined;

  if (decision.kind === 'critical') {
    const knowledge = recentKnowledge.find((k) => k.KnowledgeID === decision.knowledgeId);
    const msg = buildCriticalNotificationMessage(
      knowledge?.Topic ?? '大事なこと',
      characterNotificationName
    );
    title = msg.title;
    body = msg.body;
    knowledgeId = decision.knowledgeId;
  } else {
    // 直近で使用済みの KnowledgeID を避けてネタを選ぶ（同じ話題の連発を抑制）
    // このキャラの履歴から使用済み KnowledgeID を収集する
    const usedKnowledgeIds = new Set(
      charNotifEvents
        .map((e: { KnowledgeID?: string }) => e.KnowledgeID)
        .filter((id: string | undefined): id is string => id !== undefined)
    );
    const freshKnowledge =
      recentKnowledge.find((k: { KnowledgeID: string }) => !usedKnowledgeIds.has(k.KnowledgeID)) ??
      recentKnowledge[0];
    const msg = buildNotificationMessage(
      {
        toneBucket: decision.toneBucket,
        knowledgeTopic: freshKnowledge?.Topic,
        characterDisplayName: characterNotificationName,
      },
      now.getTime()
    );
    title = msg.title;
    body = msg.body;
    knowledgeId = freshKnowledge?.KnowledgeID;
  }

  return {
    characterId,
    kind: decision.kind,
    knowledgeId,
    title,
    body,
    lastNormalAt,
  };
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
      const userMessages = messages.filter((m) => m.Role === 'user');
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
