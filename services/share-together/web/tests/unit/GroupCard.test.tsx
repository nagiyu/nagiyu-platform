import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { GroupCard } from '@/components/GroupCard';

describe('GroupCard', () => {
  it('グループ名・メンバー数・リンクを表示する', () => {
    render(<GroupCard name="買い物グループ" memberCount={3} href="/groups/group-1" />);

    expect(screen.getByRole('heading', { name: '買い物グループ' })).toBeInTheDocument();
    expect(screen.getByText('メンバー数: 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /買い物グループ/ })).toHaveAttribute(
      'href',
      '/groups/group-1'
    );
  });
});
