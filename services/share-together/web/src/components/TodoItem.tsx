'use client';

import { useState, type KeyboardEvent } from 'react';
import { Box, ListItem, Typography } from '@mui/material';
import { Button, Checkbox, TextField } from '@nagiyu/ui';
import { useEnterSubmit } from '@nagiyu/react';
import type { TodoItem as TodoItemType } from '@/types';

/** サーバー側 (core の ToDo タイトル検証) の上限と同じ値。超過分は API で拒否されるため入力時点で制限する。 */
const TODO_TITLE_MAX_LENGTH = 200;

type TodoItemProps = {
  todo: Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'>;
  onToggleComplete?: (todoId: string) => void;
  onDelete?: (todoId: string) => void;
  /** 更新の成否を返す。失敗 (false) のときは編集欄を開いたまま入力を残して再試行できるようにする。 */
  onUpdate?: (todoId: string, title: string) => Promise<boolean> | boolean;
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

  const handleEditSave = async () => {
    if (isEditingTitleEmpty) {
      return;
    }

    // 変更が無いのに更新 API を呼ぶと、無意味な通信と「ToDoを更新しました。」の通知が出てしまう。
    if (editingTitle.trim() === todo.title.trim()) {
      setIsEditing(false);
      return;
    }

    const succeeded = (await onUpdate?.(todo.todoId, editingTitle.trim())) !== false;
    if (succeeded) {
      setIsEditing(false);
    }
  };

  // タイトル編集入力でエンターキーを押したときに保存を実行するハンドラ
  // TextField の onKeyDown は HTMLInputElement | HTMLTextAreaElement 型を受け取るため型引数を明示する
  // 編集中でないときも hook はトップレベルで呼ぶが、ハンドラは編集中の TextField にのみ渡す
  const handleEditEnterDown = useEnterSubmit<HTMLInputElement | HTMLTextAreaElement>(
    () => void handleEditSave(),
    { disabled: isEditingTitleEmpty }
  );

  // Escape で編集をキャンセルする。IME の変換取り消しとしても Escape が使われるため、変換中は編集まで閉じない。
  const handleEditKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      handleEditCancel();
      return;
    }
    handleEditEnterDown(event);
  };

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
            maxLength={TODO_TITLE_MAX_LENGTH}
            fullWidth
            onKeyDown={handleEditKeyDown}
          />
        ) : (
          <Typography
            component="span"
            sx={{
              flexGrow: 1,
              // 空白の無い長いタイトルが編集・削除ボタンを押し出さないよう、任意の位置で折り返す
              overflowWrap: 'anywhere',
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
            <Button
              variant="solid"
              onClick={() => void handleEditSave()}
              disabled={isEditingTitleEmpty}
            >
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
