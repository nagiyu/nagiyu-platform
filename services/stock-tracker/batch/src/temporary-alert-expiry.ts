/**
 * 1時間間隔バッチ処理のLambda Handler
 * EventBridge Scheduler から rate(1 hour) で実行される
 *
 * 期限切れの一時通知アラートを「無効化 + DynamoDB TTL」によって失効させる。
 * - subscription / ConditionList などバッチ処理に不要な属性は読み込まない
 * - 物理削除は DynamoDB TTL に委ねる（TTL_GRACE_DAYS 後を Unix 秒で TTL 設定）
 */

import { logger } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';
import type {
  AlertRepository,
  ExchangeRepository,
  TemporaryAlertCandidate,
} from '@nagiyu/stock-tracker-core';
import {
  DynamoDBAlertRepository,
  DynamoDBExchangeRepository,
  getLastTradingDate,
  isTradingHours,
} from '@nagiyu/stock-tracker-core';

export interface ScheduledEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: Record<string, unknown>;
}

export interface HandlerResponse {
  statusCode: number;
  body: string;
}

interface BatchStatistics {
  totalAlerts: number;
  skippedNonTemporary: number;
  skippedInvalidData: number;
  skippedTradingHours: number;
  skippedNotExpired: number;
  deactivated: number;
  deactivatedManually: number;
  errors: number;
}

const MAX_PAGES_PER_FREQUENCY = 20;

/**
 * 失効させたアラートに設定する TTL の猶予期間（日数）。
 * バッチ実行時刻 + この日数を Unix 秒に変換して TTL 属性に設定する。
 * DynamoDB TTL の発火遅延（最大 48 時間）を吸収できる長さを選ぶ。
 */
const EXPIRED_ALERT_TTL_GRACE_DAYS = 7;

async function getAllTemporaryCandidatesByFrequency(
  alertRepo: AlertRepository,
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL'
): Promise<TemporaryAlertCandidate[]> {
  const candidates: TemporaryAlertCandidate[] = [];
  let cursor: string | undefined;
  let page = 0;

  while (page < MAX_PAGES_PER_FREQUENCY) {
    const result = await alertRepo.getTemporaryCandidatesByFrequency(frequency, { cursor });
    candidates.push(...result.items);
    page++;

    if (!result.nextCursor) {
      return candidates;
    }

    cursor = result.nextCursor;
  }

  logger.warn('一時通知アラート取得のページ上限に達したため途中終了します', {
    frequency,
    maxPages: MAX_PAGES_PER_FREQUENCY,
    fetchedAlerts: candidates.length,
  });

  return candidates;
}

function calculateTtlSeconds(now: number): number {
  return Math.floor((now + EXPIRED_ALERT_TTL_GRACE_DAYS * 24 * 60 * 60 * 1000) / 1000);
}

async function processCandidate(
  candidate: TemporaryAlertCandidate,
  alertRepo: AlertRepository,
  exchangeRepo: ExchangeRepository,
  now: number,
  stats: BatchStatistics
): Promise<void> {
  try {
    // getTemporaryCandidatesByFrequency 側で Temporary=true && TTL 未設定 に絞っているが、
    // InMemory / 将来の実装の差異で漏れた場合の保険として再チェックする。
    if (!candidate.Temporary) {
      stats.skippedNonTemporary++;
      return;
    }
    if (!candidate.TemporaryExpireDate) {
      stats.skippedInvalidData++;
      return;
    }

    // ユーザーが手動で無効化した一時アラートは取引時間 / 期限到来を待たず、
    // 即時に TTL を付与して物理削除予約する。
    if (!candidate.Enabled) {
      const ttlSeconds = calculateTtlSeconds(now);
      await alertRepo.markTemporaryAsExpired(candidate.UserID, candidate.AlertID, ttlSeconds);
      stats.deactivatedManually++;
      return;
    }

    const exchange = await exchangeRepo.getById(candidate.ExchangeID);
    if (!exchange) {
      stats.errors++;
      return;
    }

    if (isTradingHours(exchange, now)) {
      stats.skippedTradingHours++;
      return;
    }

    const lastTradingDate = getLastTradingDate(exchange, now);
    if (lastTradingDate < candidate.TemporaryExpireDate) {
      stats.skippedNotExpired++;
      return;
    }

    const ttlSeconds = calculateTtlSeconds(now);
    await alertRepo.markTemporaryAsExpired(candidate.UserID, candidate.AlertID, ttlSeconds);
    stats.deactivated++;
  } catch (error) {
    stats.errors++;
    logger.error('一時通知アラートの失効処理でエラーが発生しました', {
      alertId: candidate.AlertID,
      userId: candidate.UserID,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handler(event: ScheduledEvent): Promise<HandlerResponse> {
  const stats: BatchStatistics = {
    totalAlerts: 0,
    skippedNonTemporary: 0,
    skippedInvalidData: 0,
    skippedTradingHours: 0,
    skippedNotExpired: 0,
    deactivated: 0,
    deactivatedManually: 0,
    errors: 0,
  };

  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const alertRepo = new DynamoDBAlertRepository(docClient, tableName);
    const exchangeRepo = new DynamoDBExchangeRepository(docClient, tableName);

    const minuteCandidates = await getAllTemporaryCandidatesByFrequency(alertRepo, 'MINUTE_LEVEL');
    const hourlyCandidates = await getAllTemporaryCandidatesByFrequency(alertRepo, 'HOURLY_LEVEL');
    const candidates = [...minuteCandidates, ...hourlyCandidates];
    stats.totalAlerts = candidates.length;

    const now = Date.now();
    for (const candidate of candidates) {
      await processCandidate(candidate, alertRepo, exchangeRepo, now, stats);
    }

    logger.info('一時通知アラート失効バッチが完了しました', {
      eventId: event.id,
      statistics: stats,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '一時通知アラート失効バッチが完了しました',
        statistics: stats,
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('一時通知アラート失効バッチでエラーが発生しました', {
      eventId: event.id,
      error: errorMessage,
      statistics: stats,
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '一時通知アラート失効バッチでエラーが発生しました',
        error: errorMessage,
        statistics: stats,
      }),
    };
  }
}
