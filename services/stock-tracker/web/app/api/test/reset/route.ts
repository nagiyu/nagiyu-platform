/**
 * Test Reset/Seed API Endpoint
 *
 * E2E テスト専用のインメモリリポジトリ初期化エンドポイント。
 * USE_IN_MEMORY_DB=true の場合のみ有効（それ以外は 404 を返し、本番相当環境では
 * 呼び出しても何もできない）。
 *
 * - DELETE（または本文なしの POST）: 全リポジトリ（Exchange/Ticker/Holding/Alert/
 *   DailySummary）とメモリストアをリセットする。
 * - POST（本文あり）: リセット後、リクエストボディの seed データを投入する。
 *
 * `/api` 配下は middleware（middleware.ts の matcher）で認証チェック対象外のため、
 * このルート自体は認証チェックを行わない。
 */

import { NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import type {
  CreateExchangeInput,
  CreateTickerInput,
  CreateHoldingInput,
  CreateAlertInput,
} from '@nagiyu/stock-tracker-core';
import {
  clearMemoryStore,
  createExchangeRepository,
  createTickerRepository,
  createHoldingRepository,
  createAlertRepository,
} from '../../../../lib/repository-factory';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  NOT_FOUND: COMMON_ERROR_MESSAGES.NOT_FOUND,
  INTERNAL_ERROR: 'テスト用データのリセットに失敗しました',
} as const;

/**
 * リセット後に投入する seed データ。すべて任意項目。
 */
interface ResetSeedData {
  exchanges?: CreateExchangeInput[];
  tickers?: CreateTickerInput[];
  holdings?: CreateHoldingInput[];
  alerts?: CreateAlertInput[];
}

function isTestMode(): boolean {
  return process.env.USE_IN_MEMORY_DB === 'true';
}

async function parseSeedData(request: Request): Promise<ResetSeedData> {
  const contentLength = request.headers.get('content-length');
  if (!contentLength || contentLength === '0') {
    return {};
  }

  const body = (await request.json()) as ResetSeedData;
  return body ?? {};
}

async function seedInMemoryData(seedData: ResetSeedData): Promise<void> {
  const exchangeRepository = createExchangeRepository();
  const tickerRepository = createTickerRepository();
  const holdingRepository = createHoldingRepository();
  const alertRepository = createAlertRepository();

  for (const exchange of seedData.exchanges ?? []) {
    await exchangeRepository.create(exchange);
  }
  for (const ticker of seedData.tickers ?? []) {
    await tickerRepository.create(ticker);
  }
  for (const holding of seedData.holdings ?? []) {
    await holdingRepository.create(holding);
  }
  for (const alert of seedData.alerts ?? []) {
    await alertRepository.create(alert);
  }
}

async function handleReset(request?: Request): Promise<NextResponse> {
  if (!isTestMode()) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND },
      { status: 404 }
    );
  }

  clearMemoryStore();

  if (request) {
    const seedData = await parseSeedData(request);
    await seedInMemoryData(seedData);
  }

  return NextResponse.json({ data: { success: true } });
}

/**
 * POST /api/test/reset - リセット + seed
 *
 * 本文なしの場合はリセットのみ行う。
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    return await handleReset(request);
  } catch (error) {
    console.error('/api/test/reset POST の実行に失敗しました', { error });
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/test/reset - リセットのみ
 */
export async function DELETE(): Promise<NextResponse> {
  try {
    return await handleReset();
  } catch (error) {
    console.error('/api/test/reset DELETE の実行に失敗しました', { error });
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}
