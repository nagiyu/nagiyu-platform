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

    expect(screen.getByRole('heading', { name: 'グループ共有リスト詳細（モック）' })).toBeInTheDocument();
    expect(screen.getByText('グループID: mock-group-1')).toBeInTheDocument();
    expect(screen.getByText('リストID: mock-list-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更新（モック）' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ToDo' })).toBeInTheDocument();
  });
});
