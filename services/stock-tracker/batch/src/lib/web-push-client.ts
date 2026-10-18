import { DEFAULT_NOTIFICATION_ICON } from '@nagiyu/common/push';
import type { NotificationPayload } from '@nagiyu/common';
import type { AlertEntity } from '@nagiyu/stock-tracker-core';

/**
 * アラート通知のペイロードを生成する
 *
 * @param alert - アラート情報
 * @param currentPrice - 現在価格
 * @returns 通知ペイロード
 */
export function createAlertNotificationPayload(
  alert: AlertEntity,
  currentPrice: number
): NotificationPayload {
  const mode = alert.mode === 'Buy' ? '買い' : '売り';
  const title = `${mode}アラート: ${alert.tickerId}`;
  const customMessage = alert.customMessage?.trim();
  const url = `/?exchangeId=${encodeURIComponent(alert.exchangeId)}&tickerId=${encodeURIComponent(
    alert.tickerId
  )}`;

  let body: string;
  let targetPrice: number;

  if (alert.conditionList.length === 1) {
    // 単一条件の場合（従来通り）
    const condition = alert.conditionList[0];
    const operatorText = condition.operator === 'gte' ? '以上' : '以下';
    body = `現在価格 $${currentPrice.toFixed(2)} が目標価格 $${condition.value.toFixed(2)} ${operatorText}になりました`;
    targetPrice = condition.value;
  } else if (alert.conditionList.length === 2) {
    // 複数条件の場合
    const gteCondition = alert.conditionList.find((c) => c.operator === 'gte');
    const lteCondition = alert.conditionList.find((c) => c.operator === 'lte');

    if (!gteCondition || !lteCondition) {
      throw new Error('複数条件のアラートには gte と lte が必要です');
    }

    // logicalOperator が未指定の場合はデフォルトで 'AND' とする（evaluateAlert の動作と一致）
    const logicalOp = alert.logicalOperator || 'AND';

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
    throw new Error(`サポートされていない条件数です: ${alert.conditionList.length}`);
  }

  return {
    title,
    body: customMessage ? `${body}\n${customMessage}` : body,
    icon: DEFAULT_NOTIFICATION_ICON,
    data: {
      alertId: alert.alertId,
      exchangeId: alert.exchangeId,
      tickerId: alert.tickerId,
      mode: alert.mode,
      currentPrice,
      targetPrice,
      url,
    },
  };
}
