import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger, toErrorMessage } from '@nagiyu/common';
import {
  DEFAULT_CHARACTER_ID,
  compressConversation,
  type CompressConversationParams,
} from '@nagiyu/livetalk-core';

export interface CompressAllConversationsParams extends Omit<
  CompressConversationParams,
  'characterName'
> {
  docClient: DynamoDBDocumentClient;
  tableName: string;
  characterName?: string;
}

export interface CompressAllConversationsResult {
  processedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
}

/**
 * 全アクティブユーザーの会話を圧縮要約する。
 *
 * DynamoDB を Scan して Type='Profile' のアイテムを列挙し、
 * 各ユーザーについて DEFAULT_CHARACTER_ID（hiyori）の会話を圧縮する。
 */
export async function compressAllConversations(
  params: CompressAllConversationsParams
): Promise<CompressAllConversationsResult> {
  const {
    docClient,
    tableName,
    llmClient,
    summaryRepo,
    messageRepo,
    memoryRepo,
    characterName = '桃瀬ひより',
    now,
    interestRepo,
    characterStateRepo,
  } = params;

  const userIds = await scanAllUserIds(docClient, tableName);

  logger.info('[compressAllConversations] ユーザー一覧取得完了', {
    userCount: userIds.length,
  });

  const result: CompressAllConversationsResult = {
    processedUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    failedUserIds: [],
  };

  for (const userId of userIds) {
    try {
      const before = { ...result };
      await compressConversation(userId, DEFAULT_CHARACTER_ID, {
        summaryRepo,
        messageRepo,
        memoryRepo,
        llmClient,
        characterName,
        now,
        interestRepo,
        characterStateRepo,
      });
      void before;
      result.processedUsers++;
    } catch (error) {
      logger.error('[compressAllConversations] ユーザー処理失敗', {
        userId,
        error: toErrorMessage(error),
      });
      result.failedUsers++;
      result.failedUserIds.push(userId);
    }
  }

  logger.info('[compressAllConversations] 全ユーザー処理完了', { ...result });
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
