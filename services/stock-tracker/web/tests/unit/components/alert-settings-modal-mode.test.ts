import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertSettingsModal from '../../../components/AlertSettingsModal';
import type { AlertResponse } from '../../../types/alert';
import type { StockChartProps } from '../../../components/StockChart';

jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: ({ tickerId, timeframe, count }: StockChartProps) =>
    React.createElement('div', null, `StockChart:${tickerId}:${timeframe}:${count ?? ''}`),
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

const editTargetWithPercentage: AlertResponse = {
  alertId: 'alert-2',
  tickerId: 'NASDAQ:AAPL',
  symbol: 'AAPL',
  name: 'Apple',
  mode: 'Sell',
  frequency: 'MINUTE_LEVEL',
  conditions: [
    {
      field: 'price',
      operator: 'gte',
      value: 210,
      isPercentage: true,
      percentageValue: 5,
      basePrice: 200,
    },
  ],
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const editTargetRange: AlertResponse = {
  alertId: 'alert-3',
  tickerId: 'NASDAQ:AAPL',
  symbol: 'AAPL',
  name: 'Apple',
  mode: 'Buy',
  frequency: 'MINUTE_LEVEL',
  conditions: [
    {
      field: 'price',
      operator: 'gte',
      value: 190,
      isPercentage: true,
      percentageValue: -5,
      basePrice: 200,
    },
    {
      field: 'price',
      operator: 'lte',
      value: 220,
      isPercentage: true,
      percentageValue: 10,
      basePrice: 200,
    },
  ],
  logicalOperator: 'AND',
  enabled: true,
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

  it('mode=edit で isPercentage=true の条件を持つアラートのとき、パーセンテージ選択UIを表示する', () => {
    const html = renderToStaticMarkup(
      React.createElement(AlertSettingsModal, {
        open: true,
        onClose: jest.fn(),
        tickerId: 'NASDAQ:AAPL',
        symbol: 'AAPL',
        exchangeId: 'NASDAQ',
        mode: 'edit',
        tradeMode: 'Sell',
        editTarget: editTargetWithPercentage,
        basePrice: 200,
      })
    );

    expect(html).toContain('アラートの編集');
    expect(html).toContain('パーセンテージ');
    expect(html).toContain('入力方式');
  });

  it('mode=edit のとき範囲指定アラートを編集できること（「条件は編集できません」メッセージを表示しない）', () => {
    const html = renderToStaticMarkup(
      React.createElement(AlertSettingsModal, {
        open: true,
        onClose: jest.fn(),
        tickerId: 'NASDAQ:AAPL',
        symbol: 'AAPL',
        exchangeId: 'NASDAQ',
        mode: 'edit',
        tradeMode: 'Buy',
        editTarget: editTargetRange,
        basePrice: 200,
      })
    );

    expect(html).toContain('アラートの編集');
    expect(html).not.toContain('範囲指定アラートの条件は編集できません');
    expect(html).toContain('入力方式');
    expect(html).toContain('パーセンテージ');
  });

  it('mode=edit で basePrice なしのとき、入力方式選択 UI を表示しない', () => {
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
    expect(html).not.toContain('入力方式');
  });
});
