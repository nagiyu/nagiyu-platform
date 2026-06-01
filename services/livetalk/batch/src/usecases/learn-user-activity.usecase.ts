import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger, toErrorMessage } from '@nagiyu/common';
import {
  DEFAULT_CHARACTER_ID,
  learnUserActivity,
  type LifecycleRepository,
  type MessageRepository,
} from '@nagiyu/livetalk-core';

export interface LearnAllUserActivitiesParams {
  docClient: DynamoDBDocumentClient;
  tableName: string;
  messageRepo: MessageRepository;
  lifecycleRepo: LifecycleRepository;
  /** 学習基準日時（省略時は実行時刻）。テスト用差し替え可。 */
  now?: () => Date;
}

export interface LearnAllUserActivitiesResult {
  processedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
}

/**
 * 全アクティブユーザーの活動時間を学習する。
 *
 * DynamoDB を Scan して Type='Profile' のアイテムを列挙し、
 * 各ユーザーについて DEFAULT_CHARACTER_ID（hiyori）の発話履歴を学習する。
 */
export async function learnAllUserActivities(
  params: LearnAllUserActivitiesParams
): Promise<LearnAllUserActivitiesResult> {
  const { docClient, tableName, messageRepo, lifecycleRepo, now } = params;

  const userIds = await scanAllUserIds(docClient, tableName);

  logger.info('[learnAllUserActivities] ユーザー一覧取得完了', {
    userCount: userIds.length,
  });

  const result: LearnAllUserActivitiesResult = {
    processedUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    failedUserIds: [],
  };

  for (const userId of userIds) {
    try {
      const outcome = await learnUserActivity(userId, DEFAULT_CHARACTER_ID, {
        messageRepo,
        lifecycleRepo,
        ...(now !== undefined && { now }),
      });
      if (outcome === 'skipped') {
        result.skippedUsers++;
      } else {
        result.processedUsers++;
      }
    } catch (error) {
      logger.error('[learnAllUserActivities] ユーザー処理失敗', {
        userId,
        error: toErrorMessage(error),
      });
      result.failedUsers++;
      result.failedUserIds.push(userId);
    }
  }

  logger.info('[learnAllUserActivities] 全ユーザー処理完了', { ...result });
  return result;
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
