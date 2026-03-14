/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AlertSettingsModal from '../../../components/AlertSettingsModal';
import { computeAlertLines } from '../../../lib/chart-overlay-lines';

jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'stock-chart' }),
}));

jest.mock('../../../lib/chart-overlay-lines', () => ({
  computeAlertLines: jest.fn(() => []),
  getChartAlertConditions: jest.fn(() => []),
}));

jest.mock('@mui/material', () => {
  const createComponent = (tag: string) => {
    const MockComponent = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children);
    MockComponent.displayName = `Mock${tag}`;
    return MockComponent;
  };

  return {
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? React.createElement('div', null, children) : null,
    DialogTitle: createComponent('h2'),
    DialogContent: createComponent('div'),
    DialogActions: createComponent('div'),
    Button: createComponent('button'),
    TextField: ({
      label,
      value,
      onChange,
      multiline,
    }: {
      label?: string;
      value?: string;
      onChange?: (event: { target: { value: string } }) => void;
      multiline?: boolean;
    }) => {
      const fieldTag = multiline ? 'textarea' : 'input';
      return React.createElement(
        'label',
        null,
        label,
        React.createElement(fieldTag, {
          'aria-label': label,
          value: value ?? '',
          onChange,
        })
      );
    },
    FormControl: createComponent('div'),
    InputLabel: createComponent('label'),
    Select: ({
      value,
      onChange,
      children,
      label,
    }: {
      value?: string;
      onChange?: (event: { target: { value: string } }) => void;
      children?: React.ReactNode;
      label?: string;
    }) =>
      React.createElement(
        'select',
        {
          'aria-label': label,
          value: value ?? '',
          onChange,
        },
        children
      ),
    MenuItem: ({ value, children }: { value: string; children: React.ReactNode }) =>
      React.createElement('option', { value }, children),
    Alert: createComponent('div'),
    CircularProgress: createComponent('span'),
    Box: createComponent('div'),
    Typography: createComponent('span'),
    FormControlLabel: ({
      control,
      label,
    }: {
      control: React.ReactNode;
      label: React.ReactNode;
    }) => React.createElement('label', null, control, label),
    Switch: ({
      checked,
      onChange,
    }: {
      checked?: boolean;
      onChange?: (event: { target: { checked: boolean } }) => void;
    }) =>
      React.createElement('input', {
        type: 'checkbox',
        checked: checked ?? false,
        onChange,
      }),
  };
});

describe('AlertSettingsModal performance', () => {
  it('通知本文の入力では chartAlertLines を再計算しない', () => {
    const computeAlertLinesMock = computeAlertLines as jest.MockedFunction<typeof computeAlertLines>;

    render(
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

    const initialCallCount = computeAlertLinesMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText('通知本文'), { target: { value: '通知本文テスト' } });

    expect(computeAlertLinesMock).toHaveBeenCalledTimes(initialCallCount);
  });
});
