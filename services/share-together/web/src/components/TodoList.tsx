'use client';

import { List, Paper, Stack, Typography } from '@mui/material';
import { TodoForm } from '@/components/TodoForm';
import { TodoItem } from '@/components/TodoItem';
import type { TodoItem as TodoItemType } from '@/types';

const MOCK_TODOS: Array<Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'>> = [
  {
    todoId: 'mock-todo-1',
    title: '牛乳を買う',
    isCompleted: false,
  },
  {
    todoId: 'mock-todo-2',
    title: '請求書を確認する',
    isCompleted: true,
  },
];

export function TodoList() {
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          ToDo
        </Typography>
        <TodoForm />
        <List disablePadding>
          {MOCK_TODOS.map((todo) => (
            <TodoItem key={todo.todoId} todo={todo} />
          ))}
        </List>
      </Stack>
    </Paper>
  );
}
