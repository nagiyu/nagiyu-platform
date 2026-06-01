import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger, toErrorMessage } from '@nagiyu/common';
import {
  DEFAULT_CHARACTER_ID,
  hiyori,
  studyForUser,
  type InterestRepository,
  type KnowledgeRepository,
  type LifecycleRepository,
  type StudyTopicRepository,
  type UlidFactory,
} from '@nagiyu/livetalk-core';
import type { IResearchClient } from '@nagiyu/livetalk-core';

export interface StudyAllUsersParams {
  docClient: DynamoDBDocumentClient;
  tableName: string;
  lifecycleRepo: LifecycleRepository;
  interestRepo: InterestRepository;
  knowledgeRepo: KnowledgeRepository;
  studyTopicRepo?: StudyTopicRepository;
  researchClient: IResearchClient;
  ulidFactory?: UlidFactory;
  now?: () => Date;
}

export interface StudyAllUsersResult {
  studiedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
}

/**
 * 全アクティブユーザーに対して勉強バッチを実行する。
 *
 * 各ユーザーについて shouldStudyNow 判定を行い、該当ユーザーのみ
 * Web リサーチ → 知識ベース保存を実行する（空振りコスト最小化）。
 */
export async function studyAllUsers(params: StudyAllUsersParams): Promise<StudyAllUsersResult> {
  const {
    docClient,
    tableName,
    lifecycleRepo,
    interestRepo,
    knowledgeRepo,
    studyTopicRepo,
    researchClient,
    ulidFactory,
    now,
  } = params;

  const userIds = await scanAllUserIds(docClient, tableName);

  logger.info('[studyAllUsers] ユーザー一覧取得完了', { userCount: userIds.length });

  const result: StudyAllUsersResult = {
    studiedUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    failedUserIds: [],
  };

  for (const userId of userIds) {
    try {
      const lifecycle = await lifecycleRepo.get({
        userId,
        characterId: DEFAULT_CHARACTER_ID,
      });

      if (!lifecycle) {
        result.skippedUsers++;
        continue;
      }

      const outcome = await studyForUser(userId, DEFAULT_CHARACTER_ID, {
        knowledgeRepo,
        interestRepo,
        studyTopicRepo,
        researchClient,
        character: hiyori,
        lifecycle,
        ulidFactory,
        now,
      });

      if (outcome.outcome === 'skipped') {
        result.skippedUsers++;
      } else {
        result.studiedUsers++;
      }
    } catch (error) {
      logger.error('[studyAllUsers] ユーザー処理失敗', {
        userId,
        error: toErrorMessage(error),
      });
      result.failedUsers++;
      result.failedUserIds.push(userId);
    }
  }

  logger.info('[studyAllUsers] 全ユーザー処理完了', { ...result });
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
