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
      />,
    );

    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '牛乳を買うの完了チェック' })).not.toBeChecked();
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
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '資料を提出するの完了チェック' }));
    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    expect(onToggleComplete).toHaveBeenCalledWith('todo-2');
    expect(onDelete).toHaveBeenCalledWith('todo-2');
    expect(screen.getByText('資料を提出する')).toHaveStyle({ textDecoration: 'line-through' });
  });
});
