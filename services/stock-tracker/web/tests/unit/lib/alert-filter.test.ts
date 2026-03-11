import { filterAlerts } from '../../../lib/alert-filter';
import type { AlertResponse } from '../../../types/alert';

const createAlert = (params: Partial<AlertResponse>): AlertResponse => ({
  alertId: params.alertId || 'alert-1',
  tickerId: params.tickerId || 'NASDAQ:AAPL',
  symbol: params.symbol || 'AAPL',
  name: params.name || 'Apple Inc.',
  mode: params.mode || 'Buy',
  frequency: params.frequency || 'MINUTE_LEVEL',
  conditions: params.conditions || [{ field: 'price', operator: 'gte', value: 100 }],
  enabled: params.enabled ?? true,
  createdAt: params.createdAt || '2026-01-01T00:00:00.000Z',
  updatedAt: params.updatedAt || '2026-01-01T00:00:00.000Z',
  logicalOperator: params.logicalOperator,
  temporary: params.temporary,
  temporaryExpireDate: params.temporaryExpireDate,
});

describe('filterAlerts', () => {
  const alerts: AlertResponse[] = [
    createAlert({ alertId: 'a1', tickerId: 'NASDAQ:AAPL', mode: 'Buy', symbol: 'AAPL' }),
    createAlert({ alertId: 'a2', tickerId: 'NASDAQ:MSFT', mode: 'Sell', symbol: 'MSFT' }),
    createAlert({ alertId: 'a3', tickerId: 'NYSE:IBM', mode: 'Sell', symbol: 'IBM' }),
  ];

  it('取引所フィルタのみ適用できる', () => {
    const result = filterAlerts(alerts, { exchangeKey: 'NASDAQ', mode: '' });
    expect(result.map((item) => item.alertId)).toEqual(['a1', 'a2']);
  });

  it('モードフィルタのみ適用できる', () => {
    const result = filterAlerts(alerts, { exchangeKey: '', mode: 'Sell' });
    expect(result.map((item) => item.alertId)).toEqual(['a2', 'a3']);
  });

  it('取引所とモードを同時適用できる', () => {
    const result = filterAlerts(alerts, { exchangeKey: 'NASDAQ', mode: 'Buy' });
    expect(result.map((item) => item.alertId)).toEqual(['a1']);
  });

  it('フィルタ未指定時は全件返す', () => {
    const result = filterAlerts(alerts, { exchangeKey: '', mode: '' });
    expect(result.map((item) => item.alertId)).toEqual(['a1', 'a2', 'a3']);
  });
});
