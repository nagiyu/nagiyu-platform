'use client';

import { useState } from 'react';
import { Box, Button, Checkbox, ListItem, TextField, Typography } from '@mui/material';
import type { TodoItem as TodoItemType } from '@/types';

type TodoItemProps = {
  todo: Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'>;
  onToggleComplete?: (todoId: string) => void;
  onDelete?: (todoId: string) => void;
  onUpdate?: (todoId: string, title: string) => void;
};

export function TodoItem({ todo, onToggleComplete, onDelete, onUpdate }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(todo.title);
  const isEditingTitleEmpty = editingTitle.trim() === '';

  const handleEditStart = () => {
    setEditingTitle(todo.title);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setEditingTitle(todo.title);
    setIsEditing(false);
  };

  const handleEditSave = () => {
    if (isEditingTitleEmpty) {
      return;
    }

    onUpdate?.(todo.todoId, editingTitle.trim());
    setIsEditing(false);
  };

  return (
    <ListItem disablePadding>
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
        <Checkbox
          checked={todo.isCompleted}
          onChange={() => onToggleComplete?.(todo.todoId)}
          inputProps={{ 'aria-label': `${todo.title}の完了チェック` }}
        />
        {isEditing ? (
          <TextField
            label="タイトルを編集"
            value={editingTitle}
            onChange={(event) => setEditingTitle(event.target.value)}
            size="small"
            fullWidth
          />
        ) : (
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
        )}
        {isEditing ? (
          <>
            <Button onClick={handleEditCancel}>キャンセル</Button>
            <Button variant="contained" onClick={handleEditSave} disabled={isEditingTitleEmpty}>
              保存
            </Button>
          </>
        ) : (
          <Button onClick={handleEditStart}>編集</Button>
        )}
        <Button color="error" onClick={() => onDelete?.(todo.todoId)}>
          削除
        </Button>
      </Box>
    </ListItem>
  );
}
