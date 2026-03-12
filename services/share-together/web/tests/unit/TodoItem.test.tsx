import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { TodoItem } from '@/components/TodoItem';

describe('TodoItem', () => {
  it('タイトル・完了チェックボックス・削除ボタンを表示する', () => {
    render(
      <TodoItem
        todo={{
          todoId: 'todo-1',
          title: '牛乳を買う',
          isCompleted: false,
        }}
      />
    );

    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '牛乳を買うの完了チェック' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
  });

  it('チェック操作と削除操作のコールバックを呼び出す', () => {
    const onToggleComplete = jest.fn();
    const onDelete = jest.fn();

    render(
      <TodoItem
        todo={{
          todoId: 'todo-2',
          title: '資料を提出する',
          isCompleted: true,
        }}
        onToggleComplete={onToggleComplete}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '資料を提出するの完了チェック' }));
    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    expect(onToggleComplete).toHaveBeenCalledWith('todo-2');
    expect(onDelete).toHaveBeenCalledWith('todo-2');
  });

  it('完了済みアイテムは初期表示で打ち消し線になる', () => {
    render(
      <TodoItem
        todo={{
          todoId: 'todo-3',
          title: '議事録を確認する',
          isCompleted: true,
        }}
      />
    );

    expect(screen.getByText('議事録を確認する')).toHaveStyle({ textDecoration: 'line-through' });
  });

  it('コールバック未指定でも操作時にエラーにならずタイトルは変更されない', () => {
    render(
      <TodoItem
        todo={{
          todoId: 'todo-4',
          title: '掃除をする',
          isCompleted: false,
        }}
      />
    );

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: '編集' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'タイトルを編集' }), {
        target: { value: '掃除を丁寧にする' },
      });
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      fireEvent.click(screen.getByRole('checkbox', { name: '掃除をするの完了チェック' }));
      fireEvent.click(screen.getByRole('button', { name: '削除' }));
    }).not.toThrow();
    expect(screen.getByText('掃除をする')).toBeInTheDocument();
  });

  it('編集して保存すると更新コールバックを呼び出す', () => {
    const onUpdate = jest.fn();

    render(
      <TodoItem
        todo={{
          todoId: 'todo-5',
          title: '元タイトル',
          isCompleted: false,
        }}
        onUpdate={onUpdate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'タイトルを編集' }), {
      target: { value: '更新後タイトル' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onUpdate).toHaveBeenCalledWith('todo-5', '更新後タイトル');
  });
});
