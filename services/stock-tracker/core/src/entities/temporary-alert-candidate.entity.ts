/**
 * Stock Tracker Core - Temporary Alert Candidate Entity
 *
 * 一時アラート失効バッチが扱う、失効判定に必要な最小限の属性のみを持つ軽量エンティティ。
 * subscription / conditionList / mode などはバッチ処理に不要なため意図的に含めない。
 */

export interface TemporaryAlertCandidate {
  alertId: string;
  userId: string;
  exchangeId: string;
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  enabled: boolean;
  temporary: boolean;
  temporaryExpireDate: string;
}
