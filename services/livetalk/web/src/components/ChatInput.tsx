'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { Button, TextField } from '@nagiyu/ui';

export interface ChatInputProps {
  /**
   * 送信時に呼ばれるコールバック。テキストは trim 済みの非空文字列。
   * false を返す(または resolve する)と送信失敗として入力を残す。
   * それ以外(true / void)は成功として入力をクリアする。
   */
  onSubmit: (text: string) => Promise<boolean | void> | boolean | void;
  /**
   * 送信処理中・音声再生中など、入力を無効化したい状態。
   */
  disabled?: boolean;
  /**
   * 通知タップ起動時などに入力欄へプリフィルするテキスト。
   * 変化したとき（非空）に内部 text state へ反映する。
   * ユーザーの編集は上書きしない（prefillText が再変化しない限り再適用されない）。
   * 送信が失敗(onSubmit が false)したときは入力を残し、それ以外はクリアする。
   */
  prefillText?: string;
}

export const CHAT_INPUT_MAX_LENGTH = 200;

/**
 * テキスト入力欄 + 送信ボタン。空文字・空白のみは送信しない。
 * 上限文字数はエコー Phase なので短めに設定（Phase 2 以降で要件に合わせて再調整）。
 */
export default function ChatInput({ onSubmit, disabled, prefillText }: ChatInputProps) {
  const [text, setText] = useState('');

  // prefillText が変化したとき（非空）に入力欄へ反映する
  useEffect(() => {
    if (prefillText) {
      setText(prefillText);
    }
  }, [prefillText]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const succeeded = await onSubmit(trimmed);
    // 失敗時に消すと、長い文を打ち直すことになる
    if (succeeded === false) {
      return;
    }
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
