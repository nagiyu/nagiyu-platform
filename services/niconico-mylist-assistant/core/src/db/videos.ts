import { PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from './client';
import type { Video, VideoSettings } from '../types';

export async function createVideo(userId: string, video: Video): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: `VIDEO#${video.videoId}`,
      GSI1PK: `VIDEO#${video.videoId}`,
      GSI1SK: `USER#${userId}`,
      ...video,
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  }));
}

export async function getVideo(userId: string, videoId: string): Promise<Video | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `VIDEO#${videoId}`,
    },
  }));

  if (!result.Item) return null;

  const { PK, SK, GSI1PK, GSI1SK, ...video } = result.Item;
  return video as Video;
}

export async function updateVideoSettings(
  userId: string,
  videoId: string,
  settings: VideoSettings
): Promise<void> {
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  if (settings.isFavorite !== undefined) {
    updateExpressions.push('#isFavorite = :isFavorite');
    expressionAttributeNames['#isFavorite'] = 'isFavorite';
    expressionAttributeValues[':isFavorite'] = settings.isFavorite;
  }

  if (settings.isSkip !== undefined) {
    updateExpressions.push('#isSkip = :isSkip');
    expressionAttributeNames['#isSkip'] = 'isSkip';
    expressionAttributeValues[':isSkip'] = settings.isSkip;
  }

  if (settings.memo !== undefined) {
    updateExpressions.push('#memo = :memo');
    expressionAttributeNames['#memo'] = 'memo';
    expressionAttributeValues[':memo'] = settings.memo;
  }

  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `VIDEO#${videoId}`,
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  }));
}

export async function deleteVideo(userId: string, videoId: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: `VIDEO#${videoId}`,
    },
  }));
}

export async function listVideos(
  userId: string,
  options?: {
    filter?: 'favorite' | 'skip' | 'all';
    limit?: number;
    lastEvaluatedKey?: Record<string, any>;
  }
): Promise<{ videos: Video[]; lastEvaluatedKey?: Record<string, any> }> {
  const queryParams: any = {
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

  if (options?.filter === 'favorite') {
    queryParams.FilterExpression = 'isFavorite = :true';
    queryParams.ExpressionAttributeValues[':true'] = true;
  } else if (options?.filter === 'skip') {
    queryParams.FilterExpression = 'isSkip = :true';
    queryParams.ExpressionAttributeValues[':true'] = true;
  }

  const result = await docClient.send(new QueryCommand(queryParams));

  const videos = (result.Items || []).map((item) => {
    const { PK, SK, GSI1PK, GSI1SK, ...video } = item;
    return video as Video;
  });

  return {
    videos,
    lastEvaluatedKey: result.LastEvaluatedKey,
  };
}
