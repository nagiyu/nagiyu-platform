'use client';

import { type FormEvent, useState } from 'react';
import { Box } from '@mui/material';
import { Button, TextField } from '@nagiyu/ui';

export interface ChatInputProps {
  /**
   * 送信時に呼ばれるコールバック。テキストは trim 済みの非空文字列。
   */
  onSubmit: (text: string) => Promise<void> | void;
  /**
   * 送信処理中・音声再生中など、入力を無効化したい状態。
   */
  disabled?: boolean;
}

export const CHAT_INPUT_MAX_LENGTH = 200;

/**
 * テキスト入力欄 + 送信ボタン。空文字・空白のみは送信しない。
 * 上限文字数はエコー Phase なので短めに設定（Phase 2 以降で要件に合わせて再調整）。
 */
export default function ChatInput({ onSubmit, disabled }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    await onSubmit(trimmed);
    setText('');
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}
    >
      <Box sx={{ flexGrow: 1 }}>
        <TextField
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="メッセージを入力"
          label="メッセージ"
          disabled={disabled}
          maxLength={CHAT_INPUT_MAX_LENGTH}
          fullWidth
        />
      </Box>
      <Button type="submit" variant="solid" disabled={disabled || text.trim().length === 0}>
        送信
      </Button>
    </Box>
  );
}
