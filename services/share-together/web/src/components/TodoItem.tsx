'use client';

import { Box, Button, Checkbox, ListItem, Typography } from '@mui/material';
import type { TodoItem as TodoItemType } from '@/types';

type TodoItemProps = {
  todo: Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'>;
  onToggleComplete?: (todoId: string) => void;
  onEdit?: (todoId: string) => void;
  onDelete?: (todoId: string) => void;
};

export function TodoItem({ todo, onToggleComplete, onEdit, onDelete }: TodoItemProps) {
  return (
    <ListItem disablePadding>
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
        <Checkbox
          checked={todo.isCompleted}
          onChange={() => onToggleComplete?.(todo.todoId)}
          inputProps={{ 'aria-label': `${todo.title}の完了チェック` }}
        />
        <Typography
          component="span"
          sx={{
            flexGrow: 1,
            textDecoration: todo.isCompleted ? 'line-through' : 'none',
            color: todo.isCompleted ? 'text.secondary' : 'text.primary',
          }}
        >
          {todo.title}
        </Typography>
        <Button onClick={() => onEdit?.(todo.todoId)}>編集</Button>
        <Button color="error" onClick={() => onDelete?.(todo.todoId)}>
          削除
        </Button>
      </Box>
    </ListItem>
  );
}
