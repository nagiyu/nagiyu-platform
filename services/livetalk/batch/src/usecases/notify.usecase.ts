import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger, toErrorMessage } from '@nagiyu/common';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import {
  DEFAULT_CHARACTER_ID,
  buildCriticalNotificationMessage,
  buildNotificationMessage,
  detectCriticalKnowledge,
  shouldNotifyNow,
  type ILLMClient,
  type KnowledgeRepository,
  type LifecycleRepository,
  type MessageRepository,
  type NotificationEventRepository,
  type PushSubscriptionRepository,
  type UlidFactory,
  defaultUlidFactory,
  NOTIFICATION_EVENT_TTL_SECONDS,
} from '@nagiyu/livetalk-core';

export interface NotifyAllUsersParams {
  docClient: DynamoDBDocumentClient;
  tableName: string;
  lifecycleRepo: LifecycleRepository;
  messageRepo: MessageRepository;
  knowledgeRepo: KnowledgeRepository;
  pushSubscriptionRepo: PushSubscriptionRepository;
  notifEventRepo: NotificationEventRepository;
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

export async function notifyAllUsers(params: NotifyAllUsersParams): Promise<NotifyAllUsersResult> {
  const {
    docClient,
    tableName,
    lifecycleRepo,
    messageRepo,
    knowledgeRepo,
    pushSubscriptionRepo,
    notifEventRepo,
    llmClient,
    ulidFactory = defaultUlidFactory,
    now = () => new Date(),
  } = params;

  const userIds = await scanAllUserIds(docClient, tableName);
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
  knowledgeRepo: KnowledgeRepository;
  pushSubscriptionRepo: PushSubscriptionRepository;
  notifEventRepo: NotificationEventRepository;
  llmClient: ILLMClient;
  ulidFactory: UlidFactory;
  vapidConfig: ReturnType<typeof getVapidConfig>;
  now: () => Date;
}

async function processUser(params: ProcessUserParams): Promise<boolean> {
  const {
    userId,
    lifecycleRepo,
    messageRepo,
    knowledgeRepo,
    pushSubscriptionRepo,
    notifEventRepo,
    llmClient,
    ulidFactory,
    vapidConfig,
    now,
  } = params;

  const characterId = DEFAULT_CHARACTER_ID;
  const currentNow = now();

  // ライフサイクル未登録のユーザーはスキップ
  const lifecycle = await lifecycleRepo.get({ userId, characterId });
  if (!lifecycle) return false;

  // プッシュサブスクリプション未登録はスキップ
  const subscriptions = await pushSubscriptionRepo.listByUser(userId);
  if (subscriptions.length === 0) return false;

  // 直近 200 件のメッセージを取得（セッション計算用。トークン上限は大きめに設定して件数優先）
  const recentMessages = await messageRepo.getRecentByTokenBudget({
    userId,
    characterId,
    hardLimit: 200,
  });
  const userMessages = recentMessages.messages.filter((m) => m.Role === 'user');

  // 通知履歴を取得（直近 60 件）
  const notifEvents = await notifEventRepo.listByUser(userId, 60);

  // クリティカル候補を取得して LLM 判定
  const recentKnowledge = await knowledgeRepo.list(userId, characterId, 10);
  const escalation = await detectCriticalKnowledge(recentKnowledge, llmClient);
  const criticalKnowledgeId = escalation.isCritical
    ? (escalation.knowledgeId ?? undefined)
    : undefined;

  // 発火判定
  const decision = shouldNotifyNow({
    userMessages,
    lifecycle,
    notificationEvents: notifEvents,
    criticalKnowledgeId,
    now: currentNow,
  });

  if (!decision.notify) {
    logger.info('[notifyAllUsers] 通知スキップ', { userId, reason: decision.reason });
    return false;
  }

  // 通知文面生成
  let title: string;
  let body: string;
  let knowledgeId: string | undefined;

  if (decision.kind === 'critical') {
    const knowledge = recentKnowledge.find((k) => k.KnowledgeID === decision.knowledgeId);
    const msg = buildCriticalNotificationMessage(knowledge?.Topic ?? '大事なこと');
    title = msg.title;
    body = msg.body;
    knowledgeId = decision.knowledgeId;
  } else {
    const latestKnowledge = recentKnowledge[0];
    const msg = buildNotificationMessage(
      { toneBucket: decision.toneBucket, knowledgeTopic: latestKnowledge?.Topic },
      currentNow.getTime()
    );
    title = msg.title;
    body = msg.body;
    knowledgeId = latestKnowledge?.KnowledgeID;
  }

  const ttl = Math.floor(currentNow.getTime() / 1000) + NOTIFICATION_EVENT_TTL_SECONDS;

  // 全サブスクリプションに送信（失敗はログのみ、無効は削除）
  let sentCount = 0;
  for (const sub of subscriptions) {
    try {
      const payload = { title, body, data: { url: '/' } };
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
        subscriptionId: sub.SubscriptionID,
        error: toErrorMessage(error),
      });
    }
  }

  if (sentCount === 0) return false;

  // 配信履歴を記録
  await notifEventRepo.put({
    UserID: userId,
    NotifID: ulidFactory(),
    Kind: decision.kind,
    Title: title,
    Body: body,
    KnowledgeID: knowledgeId,
    Ttl: ttl,
  });

  return true;
}

async function scanAllUserIds(
  docClient: DynamoDBDocumentClient,
  tableName: string
): Promise<string[]> {
  const userIds: string[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const command = new ScanCommand({
      TableName: tableName,
      FilterExpression: '#type = :profile',
      ExpressionAttributeNames: { '#type': 'Type' },
      ExpressionAttributeValues: { ':profile': 'Profile' },
      ProjectionExpression: 'UserID',
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
    });

    const response = await docClient.send(command);
    for (const item of response.Items ?? []) {
      if (typeof item.UserID === 'string' && item.UserID) {
        userIds.push(item.UserID);
      }
    }
    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey !== undefined);

  return userIds;
}
