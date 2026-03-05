import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertSettingsModal from '../../../components/AlertSettingsModal';
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
        alertMode: 'Buy',
        editTarget,
      })
    );

    expect(html).toContain('アラートの編集');
    expect(html).not.toContain('Web Push通知の許可をリクエスト');
    expect(html).toContain('アラートを有効にする');
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
        alertMode: 'Buy',
      })
    );

    expect(html).toContain('アラート設定');
    expect(html).toContain('Web Push通知の許可をリクエスト');
  });
});
