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

    fireEvent.click(screen.getAllByRole('button', { name: '承認' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '拒否' })[0]);
    expect(screen.getByRole('button', { name: '承認済み' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '拒否済み' })).toBeDisabled();
    expect(screen.getByText('参加ステータスを承認に更新しました（モック）')).toBeInTheDocument();
    expect(screen.getByText('参加ステータスを拒否に更新しました（モック）')).toBeInTheDocument();
  });
});
