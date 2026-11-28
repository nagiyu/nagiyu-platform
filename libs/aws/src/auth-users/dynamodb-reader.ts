/**
 * DynamoDB 実装の AuthUserRoleSourceReader
 */

import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { toDatabaseError } from '../dynamodb/errors.js';
import { LEGACY_ATTRIBUTE_NAMES, readRoleGrants, readRoles } from './mapper.js';
import type { AuthUserRoleSourceReader, AuthUserRoleSources } from './reader.js';

/**
 * ロールの解釈に要る属性だけを読む。
 *
 * 呼び出し側 (LiveTalk) は個人情報を持たない方針のため、メールや名前は読まない。
 * 旧名の項目も残っているので、旧名も含める。
 */
const ROLE_ATTRIBUTE_NAMES = ['Roles', ...LEGACY_ATTRIBUTE_NAMES.Roles, 'RoleGrants'] as const;

/** 予約語との衝突を避けるため、属性名はプレースホルダ経由で指定する */
const EXPRESSION_ATTRIBUTE_NAMES: Record<string, string> = Object.fromEntries(
  ROLE_ATTRIBUTE_NAMES.map((name) => [`#${name}`, name])
);
const PROJECTION_EXPRESSION = Object.keys(EXPRESSION_ATTRIBUTE_NAMES).join(', ');

/**
 * DynamoDB をバックエンドとする AuthUserRoleSourceReader。
 */
export class DynamoDBAuthUserRoleSourceReader implements AuthUserRoleSourceReader {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async getRoleSources(userId: string): Promise<AuthUserRoleSources | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { userId },
          ProjectionExpression: PROJECTION_EXPRESSION,
          ExpressionAttributeNames: EXPRESSION_ATTRIBUTE_NAMES,
        })
      );
      if (!result.Item) {
        return null;
      }
      return {
        roles: readRoles(result.Item),
        roleGrants: readRoleGrants(result.Item) ?? [],
      };
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}
