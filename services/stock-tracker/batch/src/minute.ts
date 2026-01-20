/**
 * 1分間隔バッチ処理のLambda Handler
 * EventBridge Scheduler から rate(1 minute) で実行される
 * MINUTE_LEVEL のアラート条件をチェックして通知を送信する
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  AlertRepository,
  ExchangeRepository,
  evaluateAlert,
  isTradingHours,
  getCurrentPrice,
  type Alert,
  type Exchange,
} from '@nagiyu/stock-tracker-core';
import webpush from 'web-push';
import { logger } from './lib/logger.js';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  MISSING_TABLE_NAME: 'TABLE_NAME 環境変数が設定されていません',
  MISSING_VAPID_KEYS: 'VAPID キーが環境変数に設定されていません',
  INVALID_VAPID_KEYS: 'VAPID キーの形式が不正です',
} as const;

/**
 * Lambda Handlerイベント型
 */
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

/**
 * Lambda Handler レスポンス型
 */
export interface HandlerResponse {
  statusCode: number;
  body: string;
}

/**
 * バッチ処理結果統計
 */
interface BatchStats {
  totalAlerts: number;
  disabledAlerts: number;
  outsideTradingHours: number;
  conditionMet: number;
  notificationsSent: number;
  errors: number;
}

/**
 * DynamoDB クライアントのシングルトン
 */
let docClient: DynamoDBDocumentClient | undefined;

/**
 * DynamoDB Document Client を取得（シングルトン）
 */
function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const client = new DynamoDBClient({});
    docClient = DynamoDBDocumentClient.from(client);
  }
  return docClient;
}

/**
 * Web Push の VAPID キーを設定
 */
function configureWebPush(): void {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error(ERROR_MESSAGES.MISSING_VAPID_KEYS);
  }

  // VAPID キーの基本的なバリデーション（Base64URL形式チェック）
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlRegex.test(vapidPublicKey) || !base64UrlRegex.test(vapidPrivateKey)) {
    throw new Error(ERROR_MESSAGES.INVALID_VAPID_KEYS);
  }

  // VAPID キーの長さチェック
  // 公開鍵は通常87文字（P-256非圧縮形式）、秘密鍵は43文字
  const MIN_PUBLIC_KEY_LENGTH = 80;
  const MIN_PRIVATE_KEY_LENGTH = 40;
  if (
    vapidPublicKey.length < MIN_PUBLIC_KEY_LENGTH ||
    vapidPrivateKey.length < MIN_PRIVATE_KEY_LENGTH
  ) {
    throw new Error(ERROR_MESSAGES.INVALID_VAPID_KEYS);
  }

  // 公開鍵は "B" で始まる必要がある（P-256非圧縮形式）
  if (!vapidPublicKey.startsWith('B')) {
    throw new Error(ERROR_MESSAGES.INVALID_VAPID_KEYS);
  }

  webpush.setVapidDetails(
    'mailto:support@nagiyu.com', // Contact email
    vapidPublicKey,
    vapidPrivateKey
  );
}

/**
 * Web Push 通知を送信
 */
async function sendWebPushNotification(
  alert: Alert,
  currentPrice: number,
  tickerId: string
): Promise<void> {
  // ConditionList[0] の存在確認
  if (!alert.ConditionList || alert.ConditionList.length === 0) {
    throw new Error('アラート条件が設定されていません');
  }

  const targetPrice = alert.ConditionList[0].value;
  const payload = JSON.stringify({
    title: `${alert.Mode === 'Sell' ? '売りアラート' : '買いアラート'}: ${tickerId}`,
    body: `現在価格: ${currentPrice.toFixed(2)} (目標: ${targetPrice.toFixed(2)})`,
    data: {
      alertId: alert.AlertID,
      tickerId: alert.TickerID,
      mode: alert.Mode,
      currentPrice,
      targetPrice,
    },
  });

  const subscription = {
    endpoint: alert.SubscriptionEndpoint,
    keys: {
      p256dh: alert.SubscriptionKeysP256dh,
      auth: alert.SubscriptionKeysAuth,
    },
  };

  await webpush.sendNotification(subscription, payload);
}

/**
 * 単一アラートを処理
 */
async function processAlert(
  alert: Alert,
  exchangeRepo: ExchangeRepository,
  stats: BatchStats
): Promise<void> {
  try {
    // 1. Enabled = true かチェック
    if (!alert.Enabled) {
      stats.disabledAlerts++;
      logger.debug('アラートが無効化されています', {
        alertId: alert.AlertID,
        userId: alert.UserID,
      });
      return;
    }

    // 2. 取引所情報を取得
    const exchange = await exchangeRepo.getById(alert.ExchangeID);
    if (!exchange) {
      logger.warn('取引所が見つかりません', {
        exchangeId: alert.ExchangeID,
        alertId: alert.AlertID,
      });
      stats.errors++;
      return;
    }

    // 3. 取引時間外チェック
    const currentTime = Date.now();
    if (!isTradingHours(exchange, currentTime)) {
      stats.outsideTradingHours++;
      logger.debug('取引時間外のため通知をスキップします', {
        alertId: alert.AlertID,
        exchangeId: alert.ExchangeID,
        currentTime: new Date(currentTime).toISOString(),
      });
      return;
    }

    // 4. TradingView API で現在価格取得
    const currentPrice = await getCurrentPrice(alert.TickerID);
    logger.debug('現在価格を取得しました', {
      alertId: alert.AlertID,
      tickerId: alert.TickerID,
      currentPrice,
    });

    // 5. アラート条件評価
    const conditionMet = evaluateAlert(alert, currentPrice);
    if (!conditionMet) {
      logger.debug('アラート条件を満たしていません', {
        alertId: alert.AlertID,
        currentPrice,
        targetPrice: alert.ConditionList[0].value,
        operator: alert.ConditionList[0].operator,
      });
      return;
    }

    stats.conditionMet++;
    logger.info('アラート条件を満たしました', {
      alertId: alert.AlertID,
      userId: alert.UserID,
      tickerId: alert.TickerID,
      currentPrice,
      targetPrice: alert.ConditionList[0].value,
    });

    // 6. Web Push 通知送信
    try {
      await sendWebPushNotification(alert, currentPrice, alert.TickerID);
      stats.notificationsSent++;
      logger.info('Web Push 通知を送信しました', {
        alertId: alert.AlertID,
        userId: alert.UserID,
      });
    } catch (notificationError) {
      stats.errors++;
      logger.error('Web Push 通知送信に失敗しました', {
        alertId: alert.AlertID,
        userId: alert.UserID,
        error:
          notificationError instanceof Error
            ? notificationError.message
            : String(notificationError),
        stack: notificationError instanceof Error ? notificationError.stack : undefined,
      });
    }
  } catch (error) {
    stats.errors++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // エラーの種類に応じたログメッセージ
    let errorStage = 'アラート処理中';
    if (errorMessage.includes('取引所')) {
      errorStage = '取引所情報の取得中';
    } else if (errorMessage.includes('価格') || errorMessage.includes('TradingView')) {
      errorStage = '現在価格の取得中';
    } else if (errorMessage.includes('条件')) {
      errorStage = 'アラート条件の評価中';
    }

    logger.error(`${errorStage}にエラーが発生しました`, {
      alertId: alert.AlertID,
      userId: alert.UserID,
      error: errorMessage,
      stack: errorStack,
    });
  }
}

/**
 * Lambda Handler
 * EventBridge Scheduler から定期実行される
 */
export async function handler(event: ScheduledEvent): Promise<HandlerResponse> {
  logger.info('1分間隔バッチ処理を開始します', {
    eventId: event.id,
    eventTime: event.time,
  });

  const stats: BatchStats = {
    totalAlerts: 0,
    disabledAlerts: 0,
    outsideTradingHours: 0,
    conditionMet: 0,
    notificationsSent: 0,
    errors: 0,
  };

  try {
    // 環境変数チェック
    const tableName = process.env.TABLE_NAME;
    if (!tableName) {
      throw new Error(ERROR_MESSAGES.MISSING_TABLE_NAME);
    }

    // Web Push VAPID キー設定
    configureWebPush();

    // リポジトリ初期化
    const client = getDocClient();
    const alertRepo = new AlertRepository(client, tableName);
    const exchangeRepo = new ExchangeRepository(client, tableName);

    // 1. GSI2 で MINUTE_LEVEL アラート一覧を取得
    logger.info('MINUTE_LEVEL アラート一覧を取得します');
    const alerts = await alertRepo.getByFrequency('MINUTE_LEVEL');
    stats.totalAlerts = alerts.length;

    logger.info('アラート一覧を取得しました', {
      totalAlerts: stats.totalAlerts,
    });

    // 2. 各アラートに対して処理（並列実行）
    await Promise.all(alerts.map((alert) => processAlert(alert, exchangeRepo, stats)));

    // 3. 処理結果をログ出力
    logger.info('1分間隔バッチ処理が正常に完了しました', {
      eventId: event.id,
      stats,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '1分間隔バッチ処理が正常に完了しました',
        stats,
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('1分間隔バッチ処理でエラーが発生しました', {
      eventId: event.id,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      stats,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '1分間隔バッチ処理でエラーが発生しました',
        error: errorMessage,
        stats,
      }),
    };
  }
}
