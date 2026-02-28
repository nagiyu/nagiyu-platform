import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PersonalListDetailPage from '@/app/lists/[listId]/page';

jest.mock('@/components/Navigation', () => ({
  Navigation: () => <div>Navigation</div>,
}));

jest.mock('@/components/ListSidebar', () => ({
  ListSidebar: () => <div>ListSidebar</div>,
}));

jest.mock('@/components/TodoList', () => ({
  TodoList: () => <div>TodoList</div>,
}));

describe('PersonalListDetailPage', () => {
  it('個人リスト詳細ページに ListSidebar と TodoList をモック表示する', async () => {
    render(
      await PersonalListDetailPage({
        params: Promise.resolve({ listId: 'mock-work-list' }),
      })
    );

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '仕事（モック）' })).toBeInTheDocument();
    expect(screen.getByText('リストID: mock-work-list')).toBeInTheDocument();
    expect(screen.getByText('ListSidebar')).toBeInTheDocument();
    expect(screen.getByText('TodoList')).toBeInTheDocument();
  });

  it('未定義の listId の場合はフォールバック名を表示する', async () => {
    render(
      await PersonalListDetailPage({
        params: Promise.resolve({ listId: 'unknown-list' }),
      })
    );

    expect(
      screen.getByRole('heading', { level: 1, name: '個人リスト（モック）' })
    ).toBeInTheDocument();
    expect(screen.getByText('リストID: unknown-list')).toBeInTheDocument();
  });
});
