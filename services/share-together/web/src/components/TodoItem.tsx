'use client';

import { useState } from 'react';
import { Box, ListItem, Typography } from '@mui/material';
import { Button, Checkbox, TextField } from '@nagiyu/ui';
import { useEnterSubmit } from '@nagiyu/react';
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

  // タイトル編集入力でエンターキーを押したときに保存を実行するハンドラ
  // TextField の onKeyDown は HTMLInputElement | HTMLTextAreaElement 型を受け取るため型引数を明示する
  // 編集中でないときも hook はトップレベルで呼ぶが、ハンドラは編集中の TextField にのみ渡す
  const handleEditEnterDown = useEnterSubmit<HTMLInputElement | HTMLTextAreaElement>(
    handleEditSave,
    { disabled: isEditingTitleEmpty }
  );

  return (
    <ListItem disablePadding>
      <Box
        sx={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}
      >
        <Checkbox
          checked={todo.isCompleted}
          onChange={() => onToggleComplete?.(todo.todoId)}
          aria-label={`${todo.title}の完了チェック`}
        />
        {isEditing ? (
          <TextField
            label="タイトルを編集"
            value={editingTitle}
            onChange={(event) => setEditingTitle(event.target.value)}
            size="sm"
            fullWidth
            onKeyDown={handleEditEnterDown}
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
            <Button variant="ghost" onClick={handleEditCancel}>
              キャンセル
            </Button>
            <Button variant="solid" onClick={handleEditSave} disabled={isEditingTitleEmpty}>
              保存
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={handleEditStart}>
            編集
          </Button>
        )}
        <Button variant="ghost" color="danger" onClick={() => onDelete?.(todo.todoId)}>
          削除
        </Button>
      </Box>
    </ListItem>
  );
}
