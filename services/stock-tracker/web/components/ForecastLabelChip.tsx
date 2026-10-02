'use client';

import { Tooltip, Typography } from '@mui/material';
import { Chip } from '@nagiyu/ui';
import type { ForecastQuestion, ProbabilityView } from '../types/forecast';
import { buildForecastLabel, type ForecastTone } from '../lib/forecast-view/labels';

interface ForecastLabelChipProps {
  question: ForecastQuestion;
  view: ProbabilityView | null | undefined;
  /** 確度がないとき「—」に添えるツールチップ */
  unavailableReason?: string;
  size?: 'sm' | 'md';
  'data-testid'?: string;
}

const TONE_COLOR = {
  up: 'success',
  down: 'danger',
  high: 'warning',
  muted: 'neutral',
} as const satisfies Record<Exclude<ForecastTone, 'none'>, string>;

/**
 * 確度のラベル表示。
 * 色だけに頼らず文字でも区別するため、強含み・弱含み・荒れそうは文言を必ず出す。
 * 中立・平常は枠線のみの控えめな見た目にする。
 */
export default function ForecastLabelChip({
  question,
  view,
  unavailableReason,
  size = 'sm',
  'data-testid': testId,
}: ForecastLabelChipProps) {
  const label = buildForecastLabel(question, view);

  if (label.tone === 'none') {
    return (
      <Tooltip title={unavailableReason ?? ''} disableHoverListener={!unavailableReason}>
        <Typography
          component="span"
          variant="body2"
          color="text.secondary"
          data-testid={testId}
          tabIndex={unavailableReason ? 0 : undefined}
          aria-label={unavailableReason ? `${label.text}（${unavailableReason}）` : undefined}
        >
          {label.text}
        </Typography>
      </Tooltip>
    );
  }

  return (
    <Chip
      size={size}
      color={TONE_COLOR[label.tone]}
      variant={label.tone === 'muted' ? 'outline' : 'solid'}
      data-testid={testId}
    >
      {label.text}
    </Chip>
  );
}
