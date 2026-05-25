'use client';

import { Box, Typography } from '@mui/material';

export interface CharacterAreaProps {
  /**
   * 0.0〜1.0 の音量レベル。再生中の音声振幅から算出される。
   * Phase 1g で Live2D の mouth_open_y に差し替える前提のプレースホルダー。
   */
  audioLevel: number;
  /**
   * 「考え中 / 話している / 待機中」の状態テキスト。
   */
  statusText?: string;
}

/**
 * Phase 1f のプレースホルダーキャラ表示。
 * インライン SVG の顔アイコンを描画し、音量に応じて口の開きと全体スケールを変える。
 * Phase 1g で Live2D（桃瀬ひより）に置き換わる。
 */
export default function CharacterArea({ audioLevel, statusText }: CharacterAreaProps) {
  // 音量で口の開き具合とスケールを駆動（簡易 lipsync）
  const clampedLevel = Math.max(0, Math.min(1, audioLevel));
  const mouthHeight = 4 + clampedLevel * 24;
  const scale = 1 + clampedLevel * 0.04;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        position: 'relative',
      }}
      data-testid="character-area"
    >
      <Box
        sx={{
          transform: `scale(${scale})`,
          transition: 'transform 60ms linear',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <svg
          width="180"
          height="220"
          viewBox="0 0 180 220"
          role="img"
          aria-label="プレースホルダーキャラクター"
        >
          <ellipse cx="90" cy="110" rx="70" ry="85" fill="#ffd9b5" />
          <path d="M 30 80 Q 90 -10 150 80 L 150 95 L 30 95 Z" fill="#5a3a2a" />
          <circle cx="65" cy="115" r="6" fill="#3a2a1a" />
          <circle cx="115" cy="115" r="6" fill="#3a2a1a" />
          <path d="M 60 145 Q 90 160 120 145" stroke="#c97a6a" strokeWidth="3" fill="none" />
          <ellipse
            cx="90"
            cy={170 + (mouthHeight - 4) / 2}
            rx="14"
            ry={mouthHeight / 2}
            fill="#7a3030"
            data-testid="character-mouth"
          />
        </svg>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1, textAlign: 'center' }}
        >
          {statusText ?? '待機中'}
        </Typography>
      </Box>
    </Box>
  );
}
