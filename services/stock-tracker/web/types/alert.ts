export type AlertMode = 'Buy' | 'Sell';

export type AlertFrequency = 'MINUTE_LEVEL' | 'HOURLY_LEVEL';

export interface AlertCondition {
  field: 'price';
  operator: 'gte' | 'lte';
  value: number;
}

export interface AlertResponse {
  alertId: string;
  tickerId: string;
  symbol: string;
  name: string;
  mode: AlertMode;
  frequency: AlertFrequency;
  conditions: AlertCondition[];
  logicalOperator?: 'AND' | 'OR';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
