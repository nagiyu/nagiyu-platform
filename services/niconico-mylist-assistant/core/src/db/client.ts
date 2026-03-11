import { getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';

export const docClient = getDynamoDBDocumentClient();

export const TABLE_NAME = getTableName();
