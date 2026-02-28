import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { InviteForm } from '@/components/InviteForm';

describe('InviteForm', () => {
  it('オーナーの場合は入力フォームを有効化し説明文を表示する', () => {
    render(<InviteForm isOwner={true} />);

    expect(screen.getByText('オーナーとしてメンバーを招待できます。')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信（モック）' })).not.toBeDisabled();
  });

  it('非オーナーの場合は入力フォームを無効化する', () => {
    render(<InviteForm isOwner={false} />);

    expect(
      screen.getByText('このグループではメンバー追加はできません（オーナーのみ）。')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信（モック）' })).toBeDisabled();
  });

  it('有効なメールアドレスを入力して送信すると完了メッセージを表示する', () => {
    render(<InviteForm isOwner={true} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信（モック）' }));

    expect(screen.getByText('招待を送信しました（モック）。')).toBeInTheDocument();
  });

  it('空のメールアドレスで送信すると完了メッセージを表示しない', () => {
    render(<InviteForm isOwner={true} />);

    fireEvent.click(screen.getByRole('button', { name: '招待を送信（モック）' }));

    expect(screen.queryByText('招待を送信しました（モック）。')).not.toBeInTheDocument();
  });

  it('無効なメールアドレスで送信すると完了メッセージを表示しない', () => {
    render(<InviteForm isOwner={true} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'invalid-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信（モック）' }));

    expect(screen.queryByText('招待を送信しました（モック）。')).not.toBeInTheDocument();
  });

  it('送信後にメールアドレスを変更すると完了メッセージが消える', () => {
    render(<InviteForm isOwner={true} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信（モック）' }));
    expect(screen.getByText('招待を送信しました（モック）。')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'another@example.com' },
    });
    expect(screen.queryByText('招待を送信しました（モック）。')).not.toBeInTheDocument();
  });
});
