import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger, toErrorMessage } from '@nagiyu/common';
import {
  getAllCharacterIds,
  getCharacterDefinitionById,
  compressConversation,
  type CompressConversationParams,
} from '@nagiyu/livetalk-core';

export type CompressAllConversationsParams = Omit<
  CompressConversationParams,
  'characterName'
> & {
  docClient: DynamoDBDocumentClient;
  tableName: string;
};

export interface CompressAllConversationsResult {
  processedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
}

/**
 * 全アクティブユーザーの全キャラクター会話を圧縮要約する。
 *
 * DynamoDB を Scan して Type='Profile' のアイテムを列挙し、
 * 各ユーザーについて全キャラクターの会話を圧縮する。
 * キャラクターごとに処理し、あるキャラクターで失敗しても他キャラクターの処理を継続する。
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
    now,
    interestRepo,
    characterStateRepo,
    embeddingClient,
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

  const allCharacterIds = getAllCharacterIds();

  for (const userId of userIds) {
    let hasCharacterError = false;

    try {
      for (const characterId of allCharacterIds) {
        const characterDef = getCharacterDefinitionById(characterId);
        if (!characterDef) {
          logger.warn('[compressAllConversations] キャラクター定義が見つかりません（スキップ）', {
            characterId,
          });
          continue;
        }

        try {
          await compressConversation(userId, characterId, {
            summaryRepo,
            messageRepo,
            memoryRepo,
            llmClient,
            characterName: characterDef.displayName,
            now,
            interestRepo,
            characterStateRepo,
            embeddingClient,
          });
        } catch (error) {
          logger.warn('[compressAllConversations] キャラクター処理失敗（他キャラは継続）', {
            userId,
            characterId,
            error: toErrorMessage(error),
          });
          hasCharacterError = true;
        }
      }

      if (hasCharacterError) {
        result.failedUsers++;
        result.failedUserIds.push(userId);
      } else {
        result.processedUsers++;
      }
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
