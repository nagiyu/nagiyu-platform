import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertSettingsModal, { computeAlertLines } from '../../../components/AlertSettingsModal';
import type { AlertResponse } from '../../../types/alert';
import type { StockChartProps } from '../../../components/StockChart';

jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: ({ tickerId, timeframe, count, holdingPrice, alertLines }: StockChartProps) =>
    React.createElement(
      'div',
      null,
      `StockChart:${tickerId}:${timeframe}:${count ?? ''}:${holdingPrice ?? ''}:${JSON.stringify(alertLines ?? [])}`
    ),
}));

jest.mock('@mui/material', () => {
  const createComponent = (tag: string) => {
    const MockComponent = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children);
    MockComponent.displayName = `Mock${tag}`;
    return MockComponent;
  };

  return {
    Dialog: createComponent('div'),
    DialogTitle: createComponent('h2'),
    DialogContent: createComponent('div'),
    DialogActions: createComponent('div'),
    Button: createComponent('button'),
    TextField: function MockTextField({ label, value, helperText }: Record<string, unknown>) {
      return React.createElement('div', null, `${label ?? ''}${value ?? ''}${helperText ?? ''}`);
    },
    FormControl: createComponent('div'),
    InputLabel: createComponent('label'),
    Select: createComponent('select'),
    MenuItem: createComponent('option'),
    Alert: createComponent('div'),
    CircularProgress: createComponent('span'),
    Box: createComponent('div'),
    Typography: createComponent('span'),
    FormControlLabel: function MockFormControlLabel({ label }: Record<string, unknown>) {
      return React.createElement('div', null, label);
    },
    Switch: createComponent('input'),
  };
});

const editTarget: AlertResponse = {
  alertId: 'alert-1',
  tickerId: 'NASDAQ:AAPL',
  symbol: 'AAPL',
  name: 'Apple',
  mode: 'Buy',
  frequency: 'MINUTE_LEVEL',
  conditions: [{ field: 'price', operator: 'lte', value: 180 }],
  enabled: true,
  temporary: true,
  temporaryExpireDate: '2026-01-02',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AlertSettingsModal mode', () => {
  it('mode=edit のとき編集タイトルを表示し Web Push 説明を表示しない', () => {
    const html = renderToStaticMarkup(
      React.createElement(AlertSettingsModal, {
        open: true,
        onClose: jest.fn(),
        tickerId: 'NASDAQ:AAPL',
        symbol: 'AAPL',
        exchangeId: 'NASDAQ',
        mode: 'edit',
        tradeMode: 'Buy',
        editTarget,
      })
    );

    expect(html).toContain('アラートの編集');
    expect(html).not.toContain('Web Push通知の許可をリクエスト');
    expect(html).toContain('アラートを有効にする');
    expect(html).toContain('株価チャート');
    expect(html).toContain('時間枠');
    expect(html).toContain('表示本数');
    expect(html).toContain('StockChart:NASDAQ:AAPL:60:100');
    expect(html).toContain('一時通知（次の取引終了まで）');
  });

  it('mode=create のとき Web Push 説明を表示する', () => {
    const html = renderToStaticMarkup(
      React.createElement(AlertSettingsModal, {
        open: true,
        onClose: jest.fn(),
        tickerId: 'NASDAQ:AAPL',
        symbol: 'AAPL',
        exchangeId: 'NASDAQ',
        mode: 'create',
        tradeMode: 'Buy',
      })
    );

    expect(html).toContain('アラート設定');
    expect(html).toContain('Web Push通知の許可をリクエスト');
    expect(html).toContain('StockChart:NASDAQ:AAPL:60:100');
    expect(html).toContain('一時通知（次の取引終了まで）');
  });

  it('holdingAveragePrice が指定されたとき StockChart に holdingPrice が渡される', () => {
    const html = renderToStaticMarkup(
      React.createElement(AlertSettingsModal, {
        open: true,
        onClose: jest.fn(),
        tickerId: 'NASDAQ:AAPL',
        symbol: 'AAPL',
        exchangeId: 'NASDAQ',
        mode: 'create',
        tradeMode: 'Buy',
        holdingAveragePrice: 150.5,
      })
    );

    expect(html).toContain('StockChart:NASDAQ:AAPL:60:100:150.5:');
  });
});

describe('computeAlertLines', () => {
  it('単一条件（lte）のとき下限アラートラインを返す', () => {
    const lines = computeAlertLines({
      conditionMode: 'single',
      operator: 'lte',
      targetPrice: '180',
      minPrice: '',
      maxPrice: '',
    });
    expect(lines).toEqual([{ value: 180, operator: 'lte' }]);
  });

  it('単一条件（gte）のとき上限アラートラインを返す', () => {
    const lines = computeAlertLines({
      conditionMode: 'single',
      operator: 'gte',
      targetPrice: '250.5',
      minPrice: '',
      maxPrice: '',
    });
    expect(lines).toEqual([{ value: 250.5, operator: 'gte' }]);
  });

  it('単一条件でターゲット価格が空のとき空配列を返す', () => {
    const lines = computeAlertLines({
      conditionMode: 'single',
      operator: 'lte',
      targetPrice: '',
      minPrice: '',
      maxPrice: '',
    });
    expect(lines).toEqual([]);
  });

  it('範囲条件のとき上限・下限アラートラインを返す', () => {
    const lines = computeAlertLines({
      conditionMode: 'range',
      operator: 'lte',
      targetPrice: '',
      minPrice: '150',
      maxPrice: '200',
    });
    expect(lines).toEqual([
      { value: 150, operator: 'lte' },
      { value: 200, operator: 'gte' },
    ]);
  });

  it('範囲条件で最小価格のみ有効なとき下限ラインのみ返す', () => {
    const lines = computeAlertLines({
      conditionMode: 'range',
      operator: 'lte',
      targetPrice: '',
      minPrice: '150',
      maxPrice: '',
    });
    expect(lines).toEqual([{ value: 150, operator: 'lte' }]);
  });
});
