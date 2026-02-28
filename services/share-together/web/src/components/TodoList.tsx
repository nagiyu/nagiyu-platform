'use client';

import { useState } from 'react';
import { List, Paper, Stack, Typography } from '@mui/material';
import { TodoForm } from '@/components/TodoForm';
import { TodoItem } from '@/components/TodoItem';
import type { TodoItem as TodoItemType } from '@/types';

const MOCK_TODOS_BY_SCOPE: Record<
  'personal' | 'group',
  Record<string, Array<Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'>>>
> = {
  personal: {
    'mock-default-list': [
      {
        todoId: 'mock-personal-default-todo-1',
        title: '牛乳を買う',
        isCompleted: false,
      },
      {
        todoId: 'mock-personal-default-todo-2',
        title: '請求書を確認する',
        isCompleted: true,
      },
    ],
    'mock-work-list': [
      {
        todoId: 'mock-personal-work-todo-1',
        title: '週次レポートを作成する',
        isCompleted: false,
      },
      {
        todoId: 'mock-personal-work-todo-2',
        title: '顧客向け資料を更新する',
        isCompleted: true,
      },
    ],
    'mock-shopping-list': [
      {
        todoId: 'mock-personal-shopping-todo-1',
        title: '卵を買う',
        isCompleted: false,
      },
      {
        todoId: 'mock-personal-shopping-todo-2',
        title: 'トイレットペーパーを買う',
        isCompleted: true,
      },
    ],
  },
  group: {
    'mock-list-1': [
      {
        todoId: 'mock-group-1-todo-1',
        title: '会議用の議題を共有する',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-1-todo-2',
        title: '懇親会の出欠を確認する',
        isCompleted: true,
      },
    ],
    'mock-list-2': [
      {
        todoId: 'mock-group-2-todo-1',
        title: 'パスポートの期限を確認する',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-2-todo-2',
        title: 'ホテルの予約内容を共有する',
        isCompleted: true,
      },
    ],
    'mock-list-3': [
      {
        todoId: 'mock-group-3-todo-1',
        title: 'ゴミ出し当番を確認する',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-3-todo-2',
        title: '消耗品の購入担当を決める',
        isCompleted: true,
      },
    ],
    'mock-list-4': [
      {
        todoId: 'mock-group-4-todo-1',
        title: 'スプリント計画を立てる',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-4-todo-2',
        title: '先週のタスクを振り返る',
        isCompleted: true,
      },
    ],
    'mock-list-5': [
      {
        todoId: 'mock-group-5-todo-1',
        title: '新機能のアイデアを投稿する',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-5-todo-2',
        title: 'ユーザーフィードバックをまとめる',
        isCompleted: false,
      },
    ],
  },
};

const DEFAULT_LIST_ID_BY_SCOPE: Record<'personal' | 'group', string> = {
  personal: 'mock-default-list',
  group: 'mock-list-1',
};

type TodoListProps = {
  scope?: 'personal' | 'group';
  listId?: string;
};

export function TodoList({ scope = 'personal', listId }: TodoListProps) {
  const todosByList = MOCK_TODOS_BY_SCOPE[scope];
  const fallbackListId = DEFAULT_LIST_ID_BY_SCOPE[scope];
  const [todos, setTodos] = useState(
    () => todosByList[listId ?? fallbackListId] ?? todosByList[fallbackListId] ?? []
  );

  const handleToggleComplete = (todoId: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.todoId === todoId ? { ...todo, isCompleted: !todo.isCompleted } : todo
      )
    );
  };

  const handleDelete = (todoId: string) => {
    setTodos((prev) => prev.filter((todo) => todo.todoId !== todoId));
  };

  const handleAdd = (title: string) => {
    const newTodo = {
      todoId: crypto.randomUUID(),
      title,
      isCompleted: false,
    };
    setTodos((prev) => [...prev, newTodo]);
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          ToDo
        </Typography>
        <TodoForm onAdd={handleAdd} />
        <List disablePadding>
          {todos.map((todo) => (
            <TodoItem
              key={todo.todoId}
              todo={todo}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDelete}
            />
          ))}
        </List>
      </Stack>
    </Paper>
  );
}
