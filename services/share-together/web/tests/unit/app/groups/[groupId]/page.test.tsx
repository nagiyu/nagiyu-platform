import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import GroupDetailPage from '@/app/groups/[groupId]/page';

describe('GroupDetailPage', () => {
  it('オーナーのグループではメンバー招待フォームを操作可能で表示する', async () => {
    render(await GroupDetailPage({ params: Promise.resolve({ groupId: 'mock-family-group' }) }));

    expect(screen.getByRole('heading', { name: 'グループ詳細（モック）' })).toBeInTheDocument();
    expect(screen.getByText('グループID: mock-family-group')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'メンバー一覧' })).toBeInTheDocument();
    expect(screen.getByText('なぎゆ')).toBeInTheDocument();
    expect(screen.getByText('さくら')).toBeInTheDocument();
    expect(screen.getByText('たろう')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'メンバー招待フォーム' })).toBeInTheDocument();
    expect(screen.getByText('オーナーとしてメンバーを招待できます。')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '招待を送信（モック）' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信（モック）' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '招待を送信（モック）' }));
    expect(screen.getByRole('button', { name: '送信予約済み' })).toBeDisabled();
    expect(screen.getByText('招待メール送信キューに追加しました（モック）')).toBeInTheDocument();
  });

  it('非オーナーのグループではメンバー招待フォームを無効化する', async () => {
    render(await GroupDetailPage({ params: Promise.resolve({ groupId: 'mock-roommate-group' }) }));

    expect(screen.getByText('グループID: mock-roommate-group')).toBeInTheDocument();
    expect(
      screen.getByText('このグループではメンバー追加はできません（オーナーのみ）。')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信（モック）' })).toBeDisabled();
  });
});
