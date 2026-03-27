import type { NotificationPayload, VapidConfig } from '@nagiyu/common';
import type { Alert } from '@nagiyu/stock-tracker-core';

export function getVapidConfig(): VapidConfig {
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: 'mailto:support@nagiyu.com',
  };
}

/**
 * アラート通知のペイロードを生成する
 *
 * @param alert - アラート情報
 * @param currentPrice - 現在価格
 * @returns 通知ペイロード
 */
export function createAlertNotificationPayload(
  alert: Alert,
  currentPrice: number
): NotificationPayload {
  const mode = alert.Mode === 'Buy' ? '買い' : '売り';
  const defaultTitle = `${mode}アラート: ${alert.TickerID}`;
  const customTitle = alert.NotificationTitle?.trim();
  const customBody = alert.NotificationBody?.trim();
  const url = `/?exchangeId=${encodeURIComponent(alert.ExchangeID)}&tickerId=${encodeURIComponent(
    alert.TickerID
  )}`;

  let body: string;
  let targetPrice: number;

  if (alert.ConditionList.length === 1) {
    // 単一条件の場合（従来通り）
    const condition = alert.ConditionList[0];
    const operatorText = condition.operator === 'gte' ? '以上' : '以下';
    body = `現在価格 $${currentPrice.toFixed(2)} が目標価格 $${condition.value.toFixed(2)} ${operatorText}になりました`;
    targetPrice = condition.value;
  } else if (alert.ConditionList.length === 2) {
    // 複数条件の場合
    const gteCondition = alert.ConditionList.find((c) => c.operator === 'gte');
    const lteCondition = alert.ConditionList.find((c) => c.operator === 'lte');

    if (!gteCondition || !lteCondition) {
      throw new Error('複数条件のアラートには gte と lte が必要です');
    }

    // LogicalOperator が未指定の場合はデフォルトで 'AND' とする（evaluateAlert の動作と一致）
    const logicalOp = alert.LogicalOperator || 'AND';

    if (logicalOp === 'AND') {
      // 範囲内アラート
      body = `現在価格 $${currentPrice.toFixed(2)} が範囲 $${gteCondition.value.toFixed(2)}〜$${lteCondition.value.toFixed(2)} 内になりました`;
      targetPrice = gteCondition.value; // 下限を代表値とする
    } else if (logicalOp === 'OR') {
      // 範囲外アラート
      body = `現在価格 $${currentPrice.toFixed(2)} が範囲外（$${lteCondition.value.toFixed(2)} 以下 または $${gteCondition.value.toFixed(2)} 以上）になりました`;
      targetPrice = gteCondition.value; // 上限を代表値とする
    } else {
      throw new Error('無効な LogicalOperator です');
    }
  } else {
    throw new Error(`サポートされていない条件数です: ${alert.ConditionList.length}`);
  }

  return {
    title: customTitle || defaultTitle,
    body: customBody || body,
    icon: '/icon-192x192.png',
    data: {
      alertId: alert.AlertID,
      exchangeId: alert.ExchangeID,
      tickerId: alert.TickerID,
      mode: alert.Mode,
      currentPrice,
      targetPrice,
      url,
    },
  };
}
