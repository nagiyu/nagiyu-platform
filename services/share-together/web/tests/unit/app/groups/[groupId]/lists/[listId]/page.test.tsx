import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import GroupListDetailPage from '@/app/groups/[groupId]/lists/[listId]/page';

describe('GroupListDetailPage', () => {
  it('モックの共有 ToDo リスト詳細ページを表示する', async () => {
    render(
      await GroupListDetailPage({
        params: Promise.resolve({ groupId: 'mock-group-1', listId: 'mock-list-1' }),
      })
    );

    expect(
      screen.getByRole('heading', { name: 'グループ共有リスト詳細（モック）' })
    ).toBeInTheDocument();
    expect(screen.getByText('グループID: mock-group-1')).toBeInTheDocument();
    expect(screen.getByText('リストID: mock-list-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更新（モック）' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '共有リスト' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '買い物リスト（共有）' })).toHaveClass('Mui-selected');
    expect(screen.getByRole('link', { name: '旅行準備リスト' })).toHaveAttribute(
      'href',
      '/groups/mock-group-1/lists/mock-list-2'
    );
    expect(screen.getByRole('heading', { name: 'ToDo' })).toBeInTheDocument();
    expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
  });
});
