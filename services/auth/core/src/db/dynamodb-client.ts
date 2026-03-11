import { getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';

export const dynamoDb = getDynamoDBDocumentClient();

export const USERS_TABLE_NAME = getTableName('nagiyu-auth-users-dev');
