import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PersonalListDetailPage from '@/app/lists/[listId]/page';

jest.mock('@/components/Navigation', () => ({
  Navigation: () => <div>Navigation</div>,
}));

jest.mock('@/components/ListWorkspace', () => ({
  ListWorkspace: () => <div>ListWorkspace</div>,
}));

describe('PersonalListDetailPage', () => {
  it('リスト詳細ページに ListWorkspace をモック表示する', async () => {
    render(
      await PersonalListDetailPage({
        params: Promise.resolve({ listId: 'mock-work-list' }),
      })
    );

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '仕事（モック）' })).toBeInTheDocument();
    expect(screen.getByText('リストID: mock-work-list')).toBeInTheDocument();
    expect(screen.getByText('ListWorkspace')).toBeInTheDocument();
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
