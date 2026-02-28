import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { TodoList } from '@/components/TodoList';

describe('TodoList', () => {
  it('個人向けのモック ToDo リストを表示する', () => {
    render(<TodoList listId="mock-default-list" />);

    expect(screen.getByRole('heading', { name: 'ToDo' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '追加' })).toBeInTheDocument();

    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();
    expect(screen.getByText('請求書を確認する')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '請求書を確認するの完了チェック' })).toBeChecked();

    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(2);
  });

  it('共有向けのモック ToDo リストを表示する', () => {
    render(<TodoList scope="group" listId="mock-list-1" />);

    expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();
    expect(screen.getByText('懇親会の出欠を確認する')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: '懇親会の出欠を確認するの完了チェック' })
    ).toBeChecked();
  });

  it('リストIDに応じたモック ToDo を表示する', () => {
    render(<TodoList scope="group" listId="mock-list-2" />);

    expect(screen.getByText('パスポートの期限を確認する')).toBeInTheDocument();
    expect(screen.queryByText('会議用の議題を共有する')).not.toBeInTheDocument();
  });

  it('追加・完了・削除ボタン押下時に一覧表示を更新する', () => {
    render(<TodoList listId="mock-default-list" />);

    fireEvent.change(screen.getByRole('textbox', { name: 'タイトル' }), {
      target: { value: '新しいタスク' },
    });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(screen.getByText('新しいタスク')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '新しいタスクの完了チェック' }));
    expect(screen.getByRole('checkbox', { name: '新しいタスクの完了チェック' })).toBeChecked();

    const deleteButton = screen
      .getAllByRole('button', { name: '削除' })
      .find((button) => button.closest('li')?.textContent?.includes('新しいタスク'));
    expect(deleteButton).toBeDefined();

    fireEvent.click(deleteButton!);
    expect(screen.queryByText('新しいタスク')).not.toBeInTheDocument();
  });
});
