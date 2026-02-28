import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TodoList } from '@/components/TodoList';

describe('TodoList', () => {
  it('個人向けのモック ToDo リストを表示する', () => {
    render(<TodoList />);

    expect(screen.getByRole('heading', { name: 'ToDo' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '追加' })).toBeInTheDocument();

    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();
    expect(screen.getByText('請求書を確認する')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '請求書を確認するの完了チェック' })).toBeChecked();

    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(2);
  });

  it('共有向けのモック ToDo リストを表示する', () => {
    render(<TodoList scope="group" />);

    expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    expect(screen.getByText('懇親会の出欠を確認する')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: '懇親会の出欠を確認するの完了チェック' })
    ).toBeChecked();
  });
});
