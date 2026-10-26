'use client';

import { useState } from 'react';
import { Box } from '@mui/material';
import { Button, TextField } from '@nagiyu/ui';

/** サーバー側 (core の ToDo タイトル検証) の上限と同じ値。超過分は API で拒否されるため入力時点で制限する。 */
const TODO_TITLE_MAX_LENGTH = 200;

type TodoFormProps = {
  /** 追加の成否を返す。失敗 (false) のときは入力を残して再試行できるようにする。 */
  onAdd?: (title: string) => Promise<boolean> | boolean;
};

export function TodoForm({ onAdd }: TodoFormProps) {
  const [title, setTitle] = useState('');
  const isTitleEmpty = title.trim() === '';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isTitleEmpty) {
      return;
    }
    const submittedTitle = title.trim();
    const succeeded = (await onAdd?.(submittedTitle)) !== false;
    if (succeeded) {
      // 送信中に入力が編集された場合は、新しい入力を消さない。
      setTitle((current) => (current.trim() === submittedTitle ? '' : current));
    }
  };

  return (
    <Box
      component="form"
      onSubmit={(event) => void handleSubmit(event)}
      sx={{ display: 'flex', gap: 1 }}
    >
      <TextField
        label="タイトル"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        size="sm"
        maxLength={TODO_TITLE_MAX_LENGTH}
        fullWidth
      />
      <Button type="submit" variant="solid" disabled={isTitleEmpty}>
        追加
      </Button>
    </Box>
  );
}
