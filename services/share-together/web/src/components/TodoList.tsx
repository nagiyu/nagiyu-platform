'use client';

import { List, Paper, Stack, Typography } from '@mui/material';
import { TodoForm } from '@/components/TodoForm';
import { TodoItem } from '@/components/TodoItem';
import type { TodoItem as TodoItemType } from '@/types';

const MOCK_TODOS_BY_SCOPE: Record<
  'personal' | 'group',
  Array<Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'>>
> = {
  personal: [
    {
      todoId: 'mock-personal-todo-1',
      title: '牛乳を買う',
      isCompleted: false,
    },
    {
      todoId: 'mock-personal-todo-2',
      title: '請求書を確認する',
      isCompleted: true,
    },
  ],
  group: [
    {
      todoId: 'mock-group-todo-1',
      title: '会議用の議題を共有する',
      isCompleted: false,
    },
    {
      todoId: 'mock-group-todo-2',
      title: '懇親会の出欠を確認する',
      isCompleted: true,
    },
  ],
};

type TodoListProps = {
  scope?: 'personal' | 'group';
};

export function TodoList({ scope = 'personal' }: TodoListProps) {
  const todos = MOCK_TODOS_BY_SCOPE[scope];

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          ToDo
        </Typography>
        <TodoForm />
        <List disablePadding>
          {todos.map((todo) => (
            <TodoItem key={todo.todoId} todo={todo} />
          ))}
        </List>
      </Stack>
    </Paper>
  );
}
