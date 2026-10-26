/**
 * MylistRegisterForm のユニットテスト
 *
 * 最大動画数の入力・送信時検証と、Push サブスクリプションの有無による送信内容を検証する。
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MylistRegisterForm from '../../../src/components/MylistRegisterForm';
import { ERROR_MESSAGES } from '../../../src/lib/constants/errors';
import { getPushSubscription } from '@nagiyu/browser';

jest.mock('@nagiyu/ui', () => ({
  Button: ({
    children,
    disabled,
    loading,
    type,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
    type?: string;
  }) => (
    <button disabled={disabled || loading} type={type as 'button' | 'submit' | 'reset'}>
      {children}
    </button>
  ),
  Checkbox: ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <label>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  ),
  TextField: ({
    label,
    value,
    onChange,
    type,
  }: {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
  }) => <input type={type || 'text'} value={value} onChange={onChange} aria-label={label} />,
  ErrorAlert: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}));

jest.mock('@nagiyu/browser', () => ({
  getPushSubscription: jest.fn(),
}));

// セッション管理は別テストで検証済みのため、登録可能な状態を通知するだけのスタブにする
jest.mock('../../../src/components/NiconicoSessionManager', () => {
  const { useEffect } = jest.requireActual('react') as typeof import('react');
  return {
    __esModule: true,
    default: function SessionManagerStub({
      onStatusChange,
    }: {
      onStatusChange?: (s: unknown) => void;
    }) {
      useEffect(() => {
        onStatusChange?.({
          hasSession: true,
          validity: 'valid',
          acquiredAt: undefined,
          estimatedExpiresAt: undefined,
        });
      }, [onStatusChange]);
      return null;
    },
  };
});

const mockFetch = jest.fn();
global.fetch = mockFetch;
const mockGetPushSubscription = getPushSubscription as jest.Mock;

function getMaxCountInput() {
  return screen.getByLabelText('登録する最大動画数') as HTMLInputElement;
}

async function fillAndSubmit(maxCount?: string) {
  if (maxCount !== undefined) {
    fireEvent.change(getMaxCountInput(), { target: { value: maxCount } });
  }
  fireEvent.change(screen.getByLabelText('マイリスト名'), { target: { value: 'テスト' } });
  const button = screen.getByRole('button', { name: 'マイリストに登録' });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
}

function requestBody() {
  return JSON.parse(mockFetch.mock.calls[0][1].body);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPushSubscription.mockResolvedValue(null);
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ jobId: 'job-1', selectedCount: 10 }),
    headers: { get: () => 'application/json' },
  });
});

describe('MylistRegisterForm - 最大動画数の入力', () => {
  it('既定値は 100 である', () => {
    render(<MylistRegisterForm />);
    expect(getMaxCountInput().value).toBe('100');
  });

  it('全部消してから 50 と打つと 50 になる', () => {
    render(<MylistRegisterForm />);

    fireEvent.change(getMaxCountInput(), { target: { value: '' } });
    expect(getMaxCountInput().value).toBe('');
    fireEvent.change(getMaxCountInput(), { target: { value: '5' } });
    fireEvent.change(getMaxCountInput(), { target: { value: '50' } });

    expect(getMaxCountInput().value).toBe('50');
  });
});

describe('MylistRegisterForm - 送信時の検証', () => {
  it('空欄ならエラーを表示して送信しない', async () => {
    render(<MylistRegisterForm />);
    await fillAndSubmit('');

    expect(
      await screen.findByText(ERROR_MESSAGES.MYLIST_REGISTER_MAX_COUNT_MUST_BE_INTEGER)
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('小数ならエラーを表示して送信しない', async () => {
    render(<MylistRegisterForm />);
    await fillAndSubmit('1.5');

    expect(
      await screen.findByText(ERROR_MESSAGES.MYLIST_REGISTER_MAX_COUNT_MUST_BE_INTEGER)
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(['0', '101'])('範囲外(%s)ならエラーを表示して送信しない', async (value) => {
    render(<MylistRegisterForm />);
    await fillAndSubmit(value);

    expect(
      await screen.findByText(ERROR_MESSAGES.MYLIST_REGISTER_MAX_COUNT_INVALID_RANGE)
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('正常値なら入力した数値で送信する', async () => {
    const onSuccess = jest.fn();
    render(<MylistRegisterForm onSuccess={onSuccess} />);
    await fillAndSubmit('50');

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch.mock.calls[0][0]).toBe('/api/mylist/register');
    expect(requestBody().maxCount).toBe(50);
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith({ jobId: 'job-1', selectedCount: 10 })
    );
  });
});

describe('MylistRegisterForm - Push サブスクリプション', () => {
  it('getPushSubscription が null でも pushSubscription なしで送信する', async () => {
    mockGetPushSubscription.mockResolvedValue(null);
    render(<MylistRegisterForm />);
    await fillAndSubmit();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(requestBody()).not.toHaveProperty('pushSubscription');
  });

  it('購読があれば pushSubscription を含めて送信する', async () => {
    mockGetPushSubscription.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }),
    });
    render(<MylistRegisterForm />);
    await fillAndSubmit();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(requestBody().pushSubscription).toEqual({
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });
});
