'use client';

import { useRef, useState } from 'react';
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
        title: 'リリース準備のチェック項目を確認する',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-4-todo-2',
        title: '担当タスクの進捗を共有する',
        isCompleted: true,
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
  const resolvedListId = listId ?? fallbackListId;
  const listKey = `${scope}:${resolvedListId}`;
  const initialTodos = todosByList[resolvedListId] ?? todosByList[fallbackListId] ?? [];
  const [todosByKey, setTodosByKey] = useState<
    Record<string, Array<Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'>>>
  >({});
  const nextMockTodoId = useRef(0);
  const todos = todosByKey[listKey] ?? initialTodos;

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          ToDo
        </Typography>
        <TodoForm
          onAdd={(title) =>
            setTodosByKey((previousTodosByKey) => ({
              ...previousTodosByKey,
              [listKey]: [
                ...todos,
                {
                  todoId: `mock-added-${nextMockTodoId.current++}`,
                  title,
                  isCompleted: false,
                },
              ],
            }))
          }
        />
        <List disablePadding>
          {todos.map((todo) => (
            <TodoItem
              key={todo.todoId}
              todo={todo}
              onToggleComplete={(todoId) =>
                setTodosByKey((previousTodosByKey) => ({
                  ...previousTodosByKey,
                  [listKey]: todos.map((previousTodo) =>
                    previousTodo.todoId === todoId
                      ? {
                          ...previousTodo,
                          isCompleted: !previousTodo.isCompleted,
                        }
                      : previousTodo
                  ),
                }))
              }
              onDelete={(todoId) =>
                setTodosByKey((previousTodosByKey) => ({
                  ...previousTodosByKey,
                  [listKey]: todos.filter((previousTodo) => previousTodo.todoId !== todoId),
                }))
              }
            />
          ))}
        </List>
      </Stack>
    </Paper>
  );
}
