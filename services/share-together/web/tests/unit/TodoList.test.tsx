import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('削除ボタンをクリックすると確認ダイアログを表示する', () => {
    render(<TodoList listId="mock-default-list" />);

    fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0]);
    expect(screen.getByText('ToDoを削除')).toBeInTheDocument();
    expect(screen.getByText('このToDoを削除しますか？')).toBeInTheDocument();
  });

  it('削除を確認すると ToDo が削除される', () => {
    render(<TodoList listId="mock-default-list" />);

    fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '削除' }));

    expect(screen.queryByText('牛乳を買う')).not.toBeInTheDocument();
    expect(screen.getByText('請求書を確認する')).toBeInTheDocument();
  });

  it('削除をキャンセルすると ToDo が残る', () => {
    render(<TodoList listId="mock-default-list" />);

    fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();
    expect(screen.getByText('請求書を確認する')).toBeInTheDocument();
  });

  it('ToDo を追加するとスナックバーに成功メッセージを表示する', () => {
    render(<TodoList listId="mock-default-list" />);

    fireEvent.change(screen.getByRole('textbox', { name: 'タイトル' }), {
      target: { value: '新しいToDo' },
    });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(screen.getByText('ToDoを追加しました。')).toBeInTheDocument();
  });

  it('チェックボックスをクリックすると完了状態が切り替わる', () => {
    render(<TodoList listId="mock-default-list" />);

    const checkbox = screen.getByRole('checkbox', { name: '牛乳を買うの完了チェック' });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
