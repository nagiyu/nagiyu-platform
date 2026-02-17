/**
 * Repository Helper for Next.js API Routes
 *
 * Provides repository initialization helpers for Next.js API Routes.
 *
 * Note: Applications using these helpers must provide DynamoDB client initialization functions.
 * See Stock Tracker's dynamodb.ts for reference implementation.
 */

import { NextResponse } from 'next/server';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * リポジトリコンストラクタ型
 */
export type RepositoryConstructor<T> = new (client: DynamoDBDocumentClient, tableName: string) => T;

/**
 * DynamoDB クライアント初期化関数型
 */
export type GetDynamoDBClient = () => DynamoDBDocumentClient;

/**
 * テーブル名取得関数型
 */
export type GetTableName = () => string;

/**
 * DynamoDB リポジトリを初期化する高階関数
 *
 * @param getDynamoDBClient - DynamoDB クライアント取得関数
 * @param getTableName - テーブル名取得関数
 * @param Repository - リポジトリコンストラクタ
 * @param handler - リポジトリを使用するハンドラー関数
 * @returns ラップされたハンドラー関数
 *
 * @example
 * ```typescript
 * import { getDynamoDBClient, getTableName } from '../lib/dynamodb';
 *
 * export const GET = withRepository(
 *   getDynamoDBClient,
 *   getTableName,
 *   HoldingRepository,
 *   async (repo, request) => {
 *     const holdings = await repo.list();
 *     return NextResponse.json(holdings);
 *   }
 * );
 * ```
 */
export function withRepository<TRepo, TArgs extends unknown[]>(
  getDynamoDBClient: GetDynamoDBClient,
  getTableName: GetTableName,
  Repository: RepositoryConstructor<TRepo>,
  handler: (repo: TRepo, ...args: TArgs) => Promise<NextResponse>
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    const docClient = getDynamoDBClient();
    const tableName = getTableName();

    const repo = new Repository(docClient, tableName);
    return handler(repo, ...args);
  };
}

/**
 * 複数リポジトリを初期化する高階関数
 *
 * @param getDynamoDBClient - DynamoDB クライアント取得関数
 * @param getTableName - テーブル名取得関数
 * @param repositories - リポジトリコンストラクタの配列
 * @param handler - リポジトリ配列を使用するハンドラー関数
 * @returns ラップされたハンドラー関数
 *
 * @example
 * ```typescript
 * import { getDynamoDBClient, getTableName } from '../lib/dynamodb';
 *
 * export const GET = withRepositories(
 *   getDynamoDBClient,
 *   getTableName,
 *   [HoldingRepository, TickerRepository],
 *   async ([holdingRepo, tickerRepo], request) => {
 *     const holdings = await holdingRepo.list();
 *     const tickers = await tickerRepo.list();
 *     return NextResponse.json({ holdings, tickers });
 *   }
 * );
 * ```
 */
export function withRepositories<TRepos extends unknown[], TArgs extends unknown[]>(
  getDynamoDBClient: GetDynamoDBClient,
  getTableName: GetTableName,
  repositories: { [K in keyof TRepos]: RepositoryConstructor<TRepos[K]> },
  handler: (repos: TRepos, ...args: TArgs) => Promise<NextResponse>
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    const docClient = getDynamoDBClient();
    const tableName = getTableName();

    const repos = repositories.map((Repo) => new Repo(docClient, tableName)) as TRepos;
    return handler(repos, ...args);
  };
}
