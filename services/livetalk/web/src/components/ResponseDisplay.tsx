'use client';

import { Box, Paper, Typography } from '@mui/material';
import { getCharacterDisplay } from '@/lib/characters/client-profiles';

export interface ResponseDisplayProps {
  /**
   * キャラクターの応答テキスト。ストリーミング中は逐次更新される。null/空なら待機メッセージを表示。
   */
  text: string | null;
  /**
   * ユーザーの発話テキスト。
   */
  userText: string | null;
  /**
   * 表示中のキャラクター ID。省略時は既定キャラクターを使用する。
   * 待機メッセージ・応答ラベルの表示名は、選択中キャラの表示名に追従する。
   */
  characterId?: string;
}

export default function ResponseDisplay({ text, userText, characterId }: ResponseDisplayProps) {
  const hasContent = Boolean(text || userText);
  const { displayName, shortName } = getCharacterDisplay(characterId);

  return (
    <Box sx={{ width: '100%' }} role="status" aria-live="polite" data-testid="response-display">
      {!hasContent && (
        <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'background.paper' }}>
          <Typography variant="body2" color="text.secondary">
            {`メッセージを入力すると、${displayName}がお話しします。`}
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
            {shortName}
          </Typography>
          <Typography variant="body2">{text}</Typography>
        </Paper>
      )}
    </Box>
  );
}
