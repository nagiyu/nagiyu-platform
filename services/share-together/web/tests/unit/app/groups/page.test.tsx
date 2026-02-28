import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import GroupsPage from '@/app/groups/page';

describe('GroupsPage', () => {
  it('モックのグループ一覧とグループ作成ボタンを表示する', () => {
    render(<GroupsPage />);

    expect(screen.getByRole('heading', { name: 'グループ一覧' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'グループを作成' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.getByRole('link', { name: /家族/ })).toHaveAttribute(
      'href',
      '/groups/mock-family-group'
    );
    expect(screen.getByRole('link', { name: /ルームメイト/ })).toHaveAttribute(
      'href',
      '/groups/mock-roommate-group'
    );
    expect(screen.getByRole('link', { name: /プロジェクトA/ })).toHaveAttribute(
      'href',
      '/groups/mock-project-group'
    );

    fireEvent.click(screen.getByRole('button', { name: 'グループを作成' }));
    expect(screen.getByText('グループを作成 を押下しました（モック）')).toBeInTheDocument();
  });
});
