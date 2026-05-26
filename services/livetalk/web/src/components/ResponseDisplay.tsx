'use client';

import { Box, Paper, Typography } from '@mui/material';

export interface ResponseDisplayProps {
  /**
   * ひよりの応答テキスト。ストリーミング中は逐次更新される。null/空なら待機メッセージを表示。
   */
  text: string | null;
  /**
   * ユーザーの発話テキスト。
   */
  userText: string | null;
}

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
            メッセージを入力すると、桃瀬ひよりがお話しします。
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
            ひより
          </Typography>
          <Typography variant="body2">{text}</Typography>
        </Paper>
      )}
    </Box>
  );
}
