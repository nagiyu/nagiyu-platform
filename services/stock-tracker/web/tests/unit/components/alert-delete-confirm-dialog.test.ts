import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertDeleteConfirmDialog from '../../../components/AlertDeleteConfirmDialog';
import type { AlertResponse } from '../../../types/alert';

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
    Typography: createComponent('span'),
    Box: createComponent('div'),
    CircularProgress: createComponent('span'),
  };
});

describe('AlertDeleteConfirmDialog', () => {
  it('単一条件アラートの削除情報を表示する', () => {
    const alert: AlertResponse = {
      alertId: 'alert-single',
      tickerId: 'NASDAQ:AAPL',
      symbol: 'AAPL',
      name: 'Apple',
      mode: 'Buy',
      frequency: 'MINUTE_LEVEL',
      conditions: [{ field: 'price', operator: 'lte', value: 180 }],
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      React.createElement(AlertDeleteConfirmDialog, {
        open: true,
        alert,
        submitting: false,
        onClose: jest.fn(),
        onConfirm: jest.fn(),
      })
    );

    expect(html).toContain('アラートの削除');
    expect(html).toContain('価格 以下 (&lt;=) 180');
    expect(html).toContain('状態:</strong> 有効');
  });

  it('範囲条件アラートの削除情報を表示する', () => {
    const alert: AlertResponse = {
      alertId: 'alert-range',
      tickerId: 'NASDAQ:MSFT',
      symbol: 'MSFT',
      name: 'Microsoft',
      mode: 'Sell',
      frequency: 'HOURLY_LEVEL',
      conditions: [
        { field: 'price', operator: 'lte', value: 200 },
        { field: 'price', operator: 'gte', value: 240 },
      ],
      logicalOperator: 'OR',
      enabled: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      React.createElement(AlertDeleteConfirmDialog, {
        open: true,
        alert,
        submitting: false,
        onClose: jest.fn(),
        onConfirm: jest.fn(),
      })
    );

    expect(html).toContain('価格 200 以下 または 240 以上（範囲外）');
    expect(html).toContain('状態:</strong> 無効');
  });
});
