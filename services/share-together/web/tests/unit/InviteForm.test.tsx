import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InviteForm } from '@/components/InviteForm';

const originalFetch = global.fetch;

describe('InviteForm', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('オーナーの場合は入力フォームを有効化し説明文を表示する', () => {
    render(<InviteForm groupId="group-1" isOwner={true} memberCount={1} />);

    expect(screen.getByText('オーナーとしてメンバーを招待できます。')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信' })).not.toBeDisabled();
  });

  it('非オーナーの場合は入力フォームを無効化する', () => {
    render(<InviteForm groupId="group-1" isOwner={false} memberCount={1} />);

    expect(
      screen.getByText('このグループではメンバー追加はできません（オーナーのみ）。')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信' })).toBeDisabled();
  });

  it('有効なメールアドレスを入力して送信すると API を呼び出して完了メッセージを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);
    render(<InviteForm groupId="group-1" isOwner={true} memberCount={1} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/groups/group-1/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      });
    });
    expect(screen.getByText('招待を送信しました。')).toBeInTheDocument();
  });

  it('空のメールアドレスで送信すると完了メッセージを表示しない', () => {
    global.fetch = jest.fn();
    render(<InviteForm groupId="group-1" isOwner={true} memberCount={1} />);

    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('無効なメールアドレスで送信すると完了メッセージを表示しない', () => {
    global.fetch = jest.fn();
    render(<InviteForm groupId="group-1" isOwner={true} memberCount={1} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'invalid-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('送信後にメールアドレスを変更すると完了メッセージが消える', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);
    render(<InviteForm groupId="group-1" isOwner={true} memberCount={1} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));
    await waitFor(() => {
      expect(screen.getByText('招待を送信しました。')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'another@example.com' },
    });
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('API がエラーを返した場合はエラーメッセージを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: '既に招待済みです' } }),
    } as Response);
    render(<InviteForm groupId="group-1" isOwner={true} memberCount={1} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    await waitFor(() => {
      expect(screen.getByText('既に招待済みです')).toBeInTheDocument();
    });
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('ネットワークエラー時は汎用エラーメッセージを表示する', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    render(<InviteForm groupId="group-1" isOwner={true} memberCount={1} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    await waitFor(() => {
      expect(screen.getByText('招待の送信に失敗しました。')).toBeInTheDocument();
    });
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('メンバー数が上限のときは招待を無効化して上限メッセージを表示する', () => {
    global.fetch = jest.fn();
    render(<InviteForm groupId="group-1" isOwner={true} memberCount={5} />);

    expect(screen.getByText('グループメンバーは最大5名です')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信' })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
