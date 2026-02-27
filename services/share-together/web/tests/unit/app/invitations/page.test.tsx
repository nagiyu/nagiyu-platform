import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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
});
