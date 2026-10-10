/**
 * LiveTalkHeader のユニットテスト。
 *
 * ナビの出し分け・アカウントメニュー・サインアウトの挙動は共通部品側でテスト済みのため、
 * ここでは次の 2 点を検証する。
 * - SessionHeader に正しい権限・props を渡していること
 * - 退会モーダルの開閉がこのコンポーネントで完結していること
 * SessionHeader・useAccountDeletion・AccountDeletionModal は副作用や他部品の挙動を
 * 分離するためモック化する。
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LiveTalkHeader from '@/components/LiveTalkHeader';

interface CapturedSessionHeaderProps {
  title?: string;
  ariaLabel?: string;
  authUrl: string;
  navigationItems?: Array<{
    label: string;
    href: string;
    requiredPermission?: string;
  }>;
  onDeleteAccount?: () => void;
}

// SessionHeader に渡された props を検証できるようにする
const mockSessionHeader = jest.fn((props: CapturedSessionHeaderProps) => (
  <button data-testid="open-deletion" onClick={props.onDeleteAccount}>
    退会
  </button>
));
jest.mock('@nagiyu/ui/session-provider', () => ({
  SessionHeader: (props: CapturedSessionHeaderProps) => mockSessionHeader(props),
}));

// useAccountDeletion をモック化して副作用を分離する
const mockRequestDeletion = jest.fn();
const mockClearError = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseAccountDeletion = jest.fn<any, any[]>(() => ({
  loading: false,
  error: null as string | null,
  requestDeletion: mockRequestDeletion,
  clearError: mockClearError,
}));
jest.mock('@/lib/account/useAccountDeletion', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAccountDeletion: (...args: any[]) => mockUseAccountDeletion(...args),
}));

// AccountDeletionModal をモック化（開閉状態と props の受け渡しのみ検証する）
const mockAccountDeletionModal = jest.fn(
  ({ open, onCancel }: { open: boolean; onCancel: () => void }) =>
    open ? (
      <div data-testid="account-deletion-modal">
        <button onClick={onCancel} data-testid="modal-cancel">
          キャンセル
        </button>
      </div>
    ) : null
);
jest.mock('@/components/AccountDeletionModal', () => ({
  __esModule: true,
  default: (props: { open: boolean; onCancel: () => void }) => mockAccountDeletionModal(props),
}));

afterEach(() => {
  jest.clearAllMocks();
});

/** SessionHeader が最後に受け取った props を返す */
function lastSessionHeaderProps(): CapturedSessionHeaderProps {
  const calls = mockSessionHeader.mock.calls;
  return calls[calls.length - 1][0];
}

describe('SessionHeader に渡す props', () => {
  it('タイトルと aria-label が「リブトーク」になる', () => {
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    const props = lastSessionHeaderProps();
    expect(props.title).toBe('リブトーク');
    expect(props.ariaLabel).toBe('リブトーク ホームに戻る');
  });

  it('authUrl をそのまま渡す', () => {
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    expect(lastSessionHeaderProps().authUrl).toBe('https://auth.nagiyu.com');
  });

  it('「私が覚えていること」と「ノート」は権限なしで表示する項目として渡す', () => {
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    const items = lastSessionHeaderProps().navigationItems;
    expect(items).toContainEqual({ label: '私が覚えていること', href: '/memory' });
    expect(items).toContainEqual({ label: 'ノート', href: '/notes' });
  });

  it('「ステータス」は livetalk:admin 権限を要求する項目として渡す', () => {
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    expect(lastSessionHeaderProps().navigationItems).toContainEqual({
      label: 'ステータス',
      href: '/status',
      requiredPermission: 'livetalk:admin',
    });
  });
});

describe('退会・データ削除導線', () => {
  it('useAccountDeletion に authUrl が引数として渡される', () => {
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    expect(mockUseAccountDeletion).toHaveBeenCalledWith('https://auth.nagiyu.com');
  });

  it('初期状態では AccountDeletionModal が閉じている', () => {
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    expect(screen.queryByTestId('account-deletion-modal')).not.toBeInTheDocument();
  });

  it('onDeleteAccount の呼び出しで AccountDeletionModal が開く', async () => {
    const user = userEvent.setup();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    await user.click(screen.getByTestId('open-deletion'));

    await waitFor(() => {
      expect(screen.getByTestId('account-deletion-modal')).toBeInTheDocument();
    });
  });

  it('onDeleteAccount の呼び出しで clearError が呼ばれる（残留エラーのクリア）', async () => {
    const user = userEvent.setup();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    await user.click(screen.getByTestId('open-deletion'));

    expect(mockClearError).toHaveBeenCalledTimes(1);
  });

  it('キャンセルボタンクリック時に AccountDeletionModal が閉じる', async () => {
    const user = userEvent.setup();
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    await user.click(screen.getByTestId('open-deletion'));
    await waitFor(() => {
      expect(screen.getByTestId('account-deletion-modal')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('modal-cancel'));

    await waitFor(() => {
      expect(screen.queryByTestId('account-deletion-modal')).not.toBeInTheDocument();
    });
  });

  it('確認操作で requestDeletion が呼ばれるよう onConfirm を渡す', () => {
    render(<LiveTalkHeader authUrl="https://auth.nagiyu.com" />);

    expect(mockAccountDeletionModal.mock.calls[0][0]).toMatchObject({
      onConfirm: mockRequestDeletion,
    });
  });
});
