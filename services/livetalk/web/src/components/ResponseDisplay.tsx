'use client';

import { Box, Paper, Typography } from '@mui/material';

export interface ResponseDisplayProps {
  /**
   * 表示するエコー応答テキスト。null/空文字なら初期メッセージを表示。
   */
  text: string | null;
  /**
   * 直近送信中・処理中のテキスト（ユーザー側の入力反復確認用）。
   */
  userText: string | null;
}

/**
 * エコー応答の表示領域。
 * Phase 2 以降は LLM のストリーミング応答に差し替わるが、本 Phase は静的表示で十分。
 */
export default function ResponseDisplay({ text, userText }: ResponseDisplayProps) {
  const hasContent = Boolean(text || userText);

  return (
    <Box
      sx={{ width: '100%', mb: 1 }}
      role="status"
      aria-live="polite"
      data-testid="response-display"
    >
      {!hasContent && (
        <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'background.paper' }}>
          <Typography variant="body2" color="text.secondary">
            メッセージを入力すると、同じ内容を声に出して返します（エコー応答）。
          </Typography>
        </Paper>
      )}
      {userText && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 1, backgroundColor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            あなた
          </Typography>
          <Typography variant="body2">{userText}</Typography>
        </Paper>
      )}
      {text && (
        <Paper variant="outlined" sx={{ p: 1.5, backgroundColor: 'background.paper' }}>
          <Typography variant="caption" color="text.secondary">
            キャラ
          </Typography>
          <Typography variant="body2">{text}</Typography>
        </Paper>
      )}
    </Box>
  );
}
