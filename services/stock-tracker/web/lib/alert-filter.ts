import type { AlertMode, AlertResponse } from '../types/alert';

export interface AlertFilterValues {
  exchangeKey: string;
  mode: '' | AlertMode;
}

export const filterAlerts = (
  alerts: AlertResponse[],
  { exchangeKey, mode }: AlertFilterValues
): AlertResponse[] => {
  return alerts.filter((alert) => {
    const alertExchangeKey = alert.tickerId.split(':')[0] || '';
    const matchesExchange = !exchangeKey || alertExchangeKey === exchangeKey;
    const matchesMode = !mode || alert.mode === mode;
    return matchesExchange && matchesMode;
  });
};
