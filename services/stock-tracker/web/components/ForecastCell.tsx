'use client';

import { Box, Typography } from '@mui/material';
import type { ForecastQuestion, ProbabilityView } from '../types/forecast';
import { formatPercent, resolveLabelSlotWidthRem } from '../lib/forecast-view/labels';
import ForecastLabelChip from './ForecastLabelChip';

interface ForecastCellProps {
  question: ForecastQuestion;
  view: ProbabilityView | null | undefined;
  unavailableReason?: string;
}

/**
 * 一覧セル用のラベルと確率。
 * ラベルの枠幅と確率の桁をそろえ、行が変わっても確率の縦位置がずれないようにする。
 * 確度なしの「—」も枠内に置き、確率の位置は空けたままにする。
 */
export default function ForecastCell({ question, view, unavailableReason }: ForecastCellProps) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        sx={{
          width: `${resolveLabelSlotWidthRem(question)}rem`,
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
        }}
      >
        <ForecastLabelChip question={question} view={view} unavailableReason={unavailableReason} />
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ width: '4ch', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
      >
        {view ? formatPercent(view.probability) : ''}
      </Typography>
    </Box>
  );
}
