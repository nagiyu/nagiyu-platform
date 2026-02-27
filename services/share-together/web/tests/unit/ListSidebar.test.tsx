import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ListSidebar } from '@/components/ListSidebar';

describe('ListSidebar', () => {
  it('モックの個人リスト一覧と作成ボタンを表示し、リストを切り替えできる', () => {
    render(<ListSidebar />);

    expect(screen.getByRole('heading', { name: '個人リスト' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'リストを作成' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'デフォルトリスト' })).toHaveClass('Mui-selected');

    const workListButton = screen.getByRole('button', { name: '仕事' });
    fireEvent.click(workListButton);

    expect(workListButton).toHaveClass('Mui-selected');
    expect(screen.getByRole('button', { name: 'デフォルトリスト' })).not.toHaveClass(
      'Mui-selected'
    );
  });
});
