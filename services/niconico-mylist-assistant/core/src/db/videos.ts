import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from './client';
import type {
  VideoBasicInfo,
  UserVideoSetting,
  CreateVideoBasicInfoInput,
  CreateUserSettingInput,
  VideoSettingUpdate,
  VideoItem,
  UserSettingItem,
} from '../types';

/**
 * 動画基本情報（VIDEO エンティティ）の操作
 */

/**
 * 動画基本情報を作成
 * @throws ConditionalCheckFailedException 既に存在する場合
 */
export async function createVideoBasicInfo(
  input: CreateVideoBasicInfoInput
): Promise<VideoBasicInfo> {
  const now = new Date().toISOString();
  const video: VideoBasicInfo = {
    ...input,
    createdAt: now,
  };

  const item: VideoItem = {
    PK: `VIDEO#${video.videoId}`,
    SK: `VIDEO#${video.videoId}`,
    entityType: 'VIDEO',
    ...video,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK)',
    })
  );

  return video;
}

/**
 * 動画基本情報を取得
 * @returns 動画基本情報、存在しない場合は null
 */
export async function getVideoBasicInfo(videoId: string): Promise<VideoBasicInfo | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `VIDEO#${videoId}`,
        SK: `VIDEO#${videoId}`,
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  // DynamoDB の内部キー（PK, SK, entityType）を除去
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { PK, SK, entityType, ...video } = result.Item;
  return video as VideoBasicInfo;
}

/**
 * 複数の動画基本情報を一括取得
 * @param videoIds 動画IDの配列（最大100件）
 * @returns 動画基本情報の配列（存在するもののみ）
 */
export async function batchGetVideoBasicInfo(videoIds: string[]): Promise<VideoBasicInfo[]> {
  if (videoIds.length === 0) {
    return [];
  }

  if (videoIds.length > 100) {
    throw new Error('batchGetVideoBasicInfo: 最大100件まで取得可能です');
  }

  const result = await docClient.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: videoIds.map((videoId) => ({
            PK: `VIDEO#${videoId}`,
            SK: `VIDEO#${videoId}`,
          })),
        },
      },
    })
  );

  const items = result.Responses?.[TABLE_NAME] || [];
  return items.map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { PK, SK, entityType, ...video } = item;
    return video as VideoBasicInfo;
  });
}

/**
 * ユーザー設定（USER_SETTING エンティティ）の操作
 */

/**
 * ユーザー設定を作成または更新
 * @returns 作成または更新されたユーザー設定
 */
export async function upsertUserVideoSetting(
  input: CreateUserSettingInput
): Promise<UserVideoSetting> {
  const now = new Date().toISOString();

  // 既存レコードの取得（createdAt を保持するため）
  const existing = await getUserVideoSetting(input.userId, input.videoId);

  const setting: UserVideoSetting = {
    ...input,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const item: UserSettingItem = {
    PK: `USER#${setting.userId}`,
    SK: `VIDEO#${setting.videoId}`,
    entityType: 'USER_SETTING',
    ...setting,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  return setting;
}

/**
 * ユーザー設定を取得
 * @returns ユーザー設定、存在しない場合は null
 */
export async function getUserVideoSetting(
  userId: string,
  videoId: string
): Promise<UserVideoSetting | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `VIDEO#${videoId}`,
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { PK, SK, entityType, ...setting } = result.Item;
  return setting as UserVideoSetting;
}

/**
 * ユーザー設定を更新
 * @throws Error 設定が存在しない場合
 */
export async function updateUserVideoSetting(
  userId: string,
  videoId: string,
  update: VideoSettingUpdate
): Promise<UserVideoSetting> {
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, string | boolean | number> = {};

  if (update.isFavorite !== undefined) {
    updateExpressions.push('#isFavorite = :isFavorite');
    expressionAttributeNames['#isFavorite'] = 'isFavorite';
    expressionAttributeValues[':isFavorite'] = update.isFavorite;
  }

  if (update.isSkip !== undefined) {
    updateExpressions.push('#isSkip = :isSkip');
    expressionAttributeNames['#isSkip'] = 'isSkip';
    expressionAttributeValues[':isSkip'] = update.isSkip;
  }

  if (update.memo !== undefined) {
    updateExpressions.push('#memo = :memo');
    expressionAttributeNames['#memo'] = 'memo';
    expressionAttributeValues[':memo'] = update.memo;
  }

  if (updateExpressions.length === 0) {
    throw new Error('更新する項目が指定されていません');
  }

  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `VIDEO#${videoId}`,
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    })
  );

  if (!result.Attributes) {
    throw new Error('更新に失敗しました');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { PK, SK, entityType, ...setting } = result.Attributes;
  return setting as UserVideoSetting;
}

/**
 * ユーザーの全動画設定を取得
 * @param userId ユーザーID
 * @param options ページネーションオプション
 * @returns 動画設定の配列と次ページのキー
 */
export async function listUserVideoSettings(
  userId: string,
  options?: {
    limit?: number;
    lastEvaluatedKey?: Record<string, string>;
  }
): Promise<{ settings: UserVideoSetting[]; lastEvaluatedKey?: Record<string, string> }> {
  type ExpressionValue = string | boolean | number;
  const queryParams: {
    TableName: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, ExpressionValue>;
    Limit: number;
    ExclusiveStartKey?: Record<string, string>;
  } = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'VIDEO#',
    },
    Limit: options?.limit || 100,
  };

  if (options?.lastEvaluatedKey) {
    queryParams.ExclusiveStartKey = options.lastEvaluatedKey;
  }

  const result = await docClient.send(new QueryCommand(queryParams));

  const settings = (result.Items || []).map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { PK, SK, entityType, ...setting } = item;
    return setting as UserVideoSetting;
  });

  return {
    settings,
    lastEvaluatedKey: result.LastEvaluatedKey as Record<string, string> | undefined,
  };
}

/**
 * ユーザー設定を削除
 */
export async function deleteUserVideoSetting(userId: string, videoId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `VIDEO#${videoId}`,
      },
    })
  );
}
