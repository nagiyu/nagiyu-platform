/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HoldingDeleteDialog from '../../../components/HoldingDeleteDialog';
import HoldingFormDialog from '../../../components/HoldingFormDialog';

const holding = {
  symbol: 'AAPL',
  name: 'Apple',
  quantity: 1500,
  averagePrice: 123.5,
  currency: 'USD',
};

const renderDelete = (overrides: Record<string, unknown> = {}) => {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  render(
    React.createElement(HoldingDeleteDialog, {
      open: true,
      holding,
      sellAlerts: [],
      submitting: false,
      onClose,
      onConfirm,
      ...overrides,
    })
  );
  return { onClose, onConfirm };
};

describe('HoldingDeleteDialog', () => {
  it('保有株式の詳細を表示し、売りアラートが無ければ警告を出さない', () => {
    renderDelete();

    expect(screen.getByRole('heading', { name: '保有株式の削除' })).toBeTruthy();
    expect(screen.getByText('1,500')).toBeTruthy();
    expect(screen.queryByText('以下の売りアラートも合わせて削除されます。')).toBeNull();
  });

  it('一緒に削除される売りアラートを条件付きで一覧表示する', () => {
    renderDelete({
      sellAlerts: [
        {
          alertId: 'a1',
          conditions: [
            { field: 'price', operator: 'gte', value: 200 },
            { field: 'price', operator: 'lte', value: 100 },
            { field: 'price', operator: 'eq', value: 1 },
          ],
        },
      ],
    });

    expect(screen.getByText('以下の売りアラートも合わせて削除されます。')).toBeTruthy();
    expect(
      screen.getByText('1. AAPL（価格 200 以上 / 価格 100 以下 / 価格 1 条件不明）')
    ).toBeTruthy();
  });

  it('holding が null でも描画できる', () => {
    renderDelete({ holding: null });

    expect(screen.queryByText('ティッカー:')).toBeNull();
  });

  it('確定とキャンセルのコールバックを呼ぶ', () => {
    const { onClose, onConfirm } = renderDelete();

    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirmDisabled の間は確定ボタンを押せない', () => {
    const { onConfirm } = renderDelete({ confirmDisabled: true });

    const confirm = screen.getByRole('button', { name: '削除' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('処理中はキャンセルを押せない', () => {
    renderDelete({ submitting: true });

    const cancel = screen.getByRole('button', { name: 'キャンセル' }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
  });
});

const baseValues = { quantity: '10', averagePrice: '150', currency: 'USD' };

const renderForm = (overrides: Record<string, unknown> = {}) => {
  const onChange = jest.fn();
  const onSubmit = jest.fn();
  const onClose = jest.fn();
  render(
    React.createElement(HoldingFormDialog, {
      open: true,
      title: '保有株式の登録',
      values: baseValues,
      errors: {},
      submitting: false,
      exchangeField: React.createElement('div', null, '取引所欄'),
      tickerField: React.createElement('div', null, 'ティッカー欄'),
      currencyEditable: true,
      onChange,
      onSubmit,
      onClose,
      ...overrides,
    })
  );
  return { onChange, onSubmit, onClose };
};

describe('HoldingFormDialog', () => {
  it('タイトル・差し込み欄・入力欄を表示する', () => {
    renderForm({ notice: React.createElement('div', null, '通知') });

    expect(screen.getByRole('heading', { name: '保有株式の登録' })).toBeTruthy();
    expect(screen.getByText('取引所欄')).toBeTruthy();
    expect(screen.getByText('ティッカー欄')).toBeTruthy();
    expect(screen.getByText('通知')).toBeTruthy();
    expect((screen.getByLabelText('保有数') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('平均取得価格') as HTMLInputElement).value).toBe('150');
  });

  it('idPrefix を入力欄の id に反映する', () => {
    renderForm({ idPrefix: 'create' });

    expect(screen.getByLabelText('保有数').id).toBe('create-quantity');
    expect(screen.getByLabelText('平均取得価格').id).toBe('create-average-price');
  });

  it('入力で onChange を呼ぶ', () => {
    const { onChange } = renderForm();

    fireEvent.change(screen.getByLabelText('保有数'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('平均取得価格'), { target: { value: '99' } });

    expect(onChange).toHaveBeenCalledWith('quantity', '20');
    expect(onChange).toHaveBeenCalledWith('averagePrice', '99');
  });

  it('エラー文言を表示する', () => {
    renderForm({ errors: { quantity: '保有数エラー', averagePrice: '価格エラー' } });

    expect(screen.getByText('保有数エラー')).toBeTruthy();
    expect(screen.getByText('価格エラー')).toBeTruthy();
  });

  it('通貨が選択可能なときは Select を、不可のときは読み取り専用の欄を出す', () => {
    const { unmount } = render(
      React.createElement(HoldingFormDialog, {
        open: true,
        title: 't',
        values: baseValues,
        errors: {},
        submitting: false,
        exchangeField: null,
        tickerField: null,
        currencyEditable: true,
        onChange: jest.fn(),
        onSubmit: jest.fn(),
        onClose: jest.fn(),
      })
    );
    expect(screen.getAllByRole('combobox').length).toBe(1);
    unmount();

    renderForm({ currencyEditable: false });
    expect(screen.queryByRole('combobox')).toBeNull();
    const currency = screen.getByLabelText('通貨') as HTMLInputElement;
    expect(currency.disabled).toBe(true);
    expect(currency.value).toBe('USD');
  });

  it('保存・キャンセルボタンでコールバックを呼ぶ', () => {
    const { onSubmit, onClose } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Enter キーで送信する', () => {
    const { onSubmit } = renderForm();

    fireEvent.keyDown(screen.getByLabelText('保有数'), { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('処理中は Enter 送信とキャンセルを無効化し、Escape でも閉じない', () => {
    const { onSubmit, onClose } = renderForm({ submitting: true });

    fireEvent.keyDown(screen.getByLabelText('保有数'), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();

    const cancel = screen.getByRole('button', { name: 'キャンセル' }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('処理中でなければ Escape で閉じる', () => {
    const { onClose } = renderForm();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
