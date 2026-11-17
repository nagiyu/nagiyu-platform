/**
 * admin の自己監視 SNS トピック名を返す。
 * トピックの作成・通知先・Lambda の受け入れ許可で同じ名前を使うため、一本化する。
 */
export function getSelfMonitoringTopicName(environment: string): string {
  return `nagiyu-admin-self-monitoring-${environment}`;
}
