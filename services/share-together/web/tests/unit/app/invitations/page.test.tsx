import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import InvitationsPage from '@/app/invitations/page';

jest.mock('@/components/Navigation', () => ({
  Navigation: () => <div>Navigation</div>,
}));

describe('InvitationsPage', () => {
  it('招待カードと承認/拒否ボタンをモック表示する', () => {
    render(<InvitationsPage />);

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '招待一覧' })).toBeInTheDocument();
    expect(screen.getByText('週末の買い出し')).toBeInTheDocument();
    expect(screen.getByText('旅行準備リスト')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '承認' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '拒否' })).toHaveLength(2);
  });

  it('承認ボタンをクリックすると招待が削除される', () => {
    render(<InvitationsPage />);

    fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);

    expect(screen.queryByText('週末の買い出し')).not.toBeInTheDocument();
    expect(screen.getByText('旅行準備リスト')).toBeInTheDocument();
  });

  it('拒否ボタンをクリックすると確認ダイアログを表示する', () => {
    render(<InvitationsPage />);

    fireEvent.click(screen.getAllByRole('button', { name: '拒否' })[0]);

    expect(screen.getByText('招待を拒否')).toBeInTheDocument();
  });

  it('拒否を確認すると招待が削除される', () => {
    render(<InvitationsPage />);

    fireEvent.click(screen.getAllByRole('button', { name: '拒否' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '拒否' }));

    expect(screen.queryByText('週末の買い出し')).not.toBeInTheDocument();
    expect(screen.getByText('旅行準備リスト')).toBeInTheDocument();
  });

  it('すべての招待を処理すると空メッセージを表示する', () => {
    render(<InvitationsPage />);

    fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '承認' }));

    expect(screen.getByText('招待はありません。')).toBeInTheDocument();
  });
});
