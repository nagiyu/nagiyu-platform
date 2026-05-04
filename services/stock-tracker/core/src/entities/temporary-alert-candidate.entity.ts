/**
 * Stock Tracker Core - Temporary Alert Candidate Entity
 *
 * 一時アラート失効バッチが扱う、失効判定に必要な最小限の属性のみを持つ軽量エンティティ。
 * subscription / ConditionList / Mode などはバッチ処理に不要なため意図的に含めない。
 */

export interface TemporaryAlertCandidate {
  AlertID: string;
  UserID: string;
  ExchangeID: string;
  Frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  Enabled: boolean;
  Temporary: boolean;
  TemporaryExpireDate: string;
}
