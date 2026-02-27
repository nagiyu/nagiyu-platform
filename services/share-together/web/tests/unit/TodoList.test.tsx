import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TodoList } from '@/components/TodoList';

describe('TodoList', () => {
  it('TodoForm と TodoItem を組み合わせたモックの ToDo リストを表示する', () => {
    render(<TodoList />);

    expect(screen.getByRole('heading', { name: 'ToDo' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '追加' })).toBeInTheDocument();

    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();
    expect(screen.getByText('請求書を確認する')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '請求書を確認するの完了チェック' })).toBeChecked();

    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(2);
  });
});
