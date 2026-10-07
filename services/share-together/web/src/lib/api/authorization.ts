import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createMembershipRepository } from '@nagiyu/share-together-core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { NextResponse } from 'next/server';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { createForbiddenErrorResponse, createValidationErrorResponse } from './responses';
import { isNonEmptyString } from './validation';

/** グループメンバー認可を通過した呼び出しに渡す文脈。 */
export type AuthorizedGroupContext<TParams extends { groupId: string }> = TParams & {
  userId: string;
  tableName: string;
  /** インメモリ DB 利用時は undefined。リポジトリ構築にそのまま渡す。 */
  docClient: DynamoDBDocumentClient | undefined;
};

/**
 * セッション確認、パス ID の検証、ACCEPTED メンバーであることの確認を行う。
 *
 * リポジトリの組み合わせは route ごとに異なるため、構築は呼び出し側に任せ、
 * 構築に必要な docClient と tableName を返す。
 *
 * @param params - 動的セグメントの params。全ての値を ID として検証する
 * @returns 認可済みの文脈。認証・検証・認可に失敗した場合はそのままレスポンスとして返せる NextResponse
 */
export async function getAuthorizedGroupContext<TParams extends { groupId: string }>(
  params: Promise<TParams>
): Promise<AuthorizedGroupContext<TParams> | NextResponse> {
  const sessionOrUnauthorized = await getSessionOrUnauthorized();
  if ('status' in sessionOrUnauthorized) {
    return sessionOrUnauthorized;
  }

  const resolvedParams = await params;
  const userId = sessionOrUnauthorized.user.id;
  if (!Object.values(resolvedParams).every(isNonEmptyString) || !isNonEmptyString(userId)) {
    return createValidationErrorResponse();
  }

  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  const membershipRepository = createMembershipRepository(docClient, tableName);
  const membership = await membershipRepository.getById(resolvedParams.groupId, userId);
  if (!membership || membership.status !== 'ACCEPTED') {
    return createForbiddenErrorResponse();
  }

  return { ...resolvedParams, userId, tableName, docClient };
}
