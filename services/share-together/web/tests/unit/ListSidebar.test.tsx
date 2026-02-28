import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ListSidebar, MOCK_PERSONAL_LISTS } from '@/components/ListSidebar';

describe('ListSidebar', () => {
  it('モックの個人リスト一覧と作成ボタンを表示し、選択中リストを強調してリンク表示する', () => {
    render(
      <ListSidebar
        heading="個人リスト"
        createButtonLabel="個人リストを作成"
        selectedListId="mock-work-list"
        lists={MOCK_PERSONAL_LISTS}
        hrefPrefix="/lists"
      />
    );

    expect(screen.getByRole('heading', { name: '個人リスト' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '個人リストを作成' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'デフォルトリスト' })).toHaveAttribute(
      'href',
      '/lists/mock-default-list'
    );

    const workListLink = screen.getByRole('link', { name: '仕事' });
    expect(workListLink).toHaveClass('Mui-selected');
    expect(screen.getByRole('link', { name: 'デフォルトリスト' })).not.toHaveClass('Mui-selected');

    fireEvent.click(screen.getByRole('button', { name: '個人リストを作成' }));
    expect(screen.getByText('個人リストを作成 を押下しました（モック）')).toBeInTheDocument();
  });
});
