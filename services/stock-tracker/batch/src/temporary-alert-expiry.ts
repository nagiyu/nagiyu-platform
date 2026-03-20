/**
 * 1時間間隔バッチ処理のLambda Handler
 * EventBridge Scheduler から rate(1 hour) で実行される
 * 一時通知アラートの期限切れを判定して無効化する
 */

import { logger } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName } from '@nagiyu/aws';
import type { AlertRepository, ExchangeRepository } from '@nagiyu/stock-tracker-core';
import {
  DynamoDBAlertRepository,
  DynamoDBExchangeRepository,
  getLastTradingDate,
  isTradingHours,
} from '@nagiyu/stock-tracker-core';
import type { Alert } from '@nagiyu/stock-tracker-core';

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
  skippedAlreadyDisabled: number;
  skippedInvalidData: number;
  skippedTradingHours: number;
  skippedNotExpired: number;
  deactivated: number;
  errors: number;
}

const MAX_PAGES_PER_FREQUENCY = 20;

async function getAllAlertsByFrequency(
  alertRepo: AlertRepository,
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL'
): Promise<Alert[]> {
  const alerts: Alert[] = [];
  let cursor: string | undefined;
  let page = 0;

  while (page < MAX_PAGES_PER_FREQUENCY) {
    const result = await alertRepo.getByFrequency(frequency, { cursor });
    alerts.push(...result.items);
    page++;

    if (!result.nextCursor) {
      return alerts;
    }

    cursor = result.nextCursor;
  }

  logger.warn('一時通知アラート取得のページ上限に達したため途中終了します', {
    frequency,
    maxPages: MAX_PAGES_PER_FREQUENCY,
    fetchedAlerts: alerts.length,
  });

  return alerts;
}

async function processAlert(
  alert: Alert,
  alertRepo: AlertRepository,
  exchangeRepo: ExchangeRepository,
  stats: BatchStatistics
): Promise<void> {
  try {
    if (alert.Temporary !== true) {
      stats.skippedNonTemporary++;
      return;
    }
    if (alert.Enabled !== true) {
      stats.skippedAlreadyDisabled++;
      return;
    }
    if (!alert.TemporaryExpireDate) {
      stats.skippedInvalidData++;
      return;
    }

    const exchange = await exchangeRepo.getById(alert.ExchangeID);
    if (!exchange) {
      stats.errors++;
      return;
    }

    const now = Date.now();
    if (isTradingHours(exchange, now)) {
      stats.skippedTradingHours++;
      return;
    }

    const lastTradingDate = getLastTradingDate(exchange, now);
    if (lastTradingDate < alert.TemporaryExpireDate) {
      stats.skippedNotExpired++;
      return;
    }

    await alertRepo.update(alert.UserID, alert.AlertID, {
      Enabled: false,
    });
    stats.deactivated++;
  } catch (error) {
    stats.errors++;
    logger.error('一時通知アラートの失効処理でエラーが発生しました', {
      alertId: alert.AlertID,
      userId: alert.UserID,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handler(event: ScheduledEvent): Promise<HandlerResponse> {
  const stats: BatchStatistics = {
    totalAlerts: 0,
    skippedNonTemporary: 0,
    skippedAlreadyDisabled: 0,
    skippedInvalidData: 0,
    skippedTradingHours: 0,
    skippedNotExpired: 0,
    deactivated: 0,
    errors: 0,
  };

  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const alertRepo = new DynamoDBAlertRepository(docClient, tableName);
    const exchangeRepo = new DynamoDBExchangeRepository(docClient, tableName);

    const minuteAlerts = await getAllAlertsByFrequency(alertRepo, 'MINUTE_LEVEL');
    const hourlyAlerts = await getAllAlertsByFrequency(alertRepo, 'HOURLY_LEVEL');
    const alerts = [...minuteAlerts, ...hourlyAlerts];
    stats.totalAlerts = alerts.length;

    for (const alert of alerts) {
      await processAlert(alert, alertRepo, exchangeRepo, stats);
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
