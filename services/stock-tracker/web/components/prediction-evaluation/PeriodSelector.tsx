'use client';

import { Box } from '@mui/material';
import { Select } from '@nagiyu/ui';
import {
  EVALUATION_PERIODS,
  PERIOD_LABELS,
  type EvaluationPeriod,
} from '@/lib/prediction-evaluation/types';

export interface PeriodSelectorProps {
  value: EvaluationPeriod;
  onChange: (period: EvaluationPeriod) => void;
}

const isEvaluationPeriod = (value: string): value is EvaluationPeriod =>
  (EVALUATION_PERIODS as readonly string[]).includes(value);

export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const handleChange = (next: string) => {
    if (isEvaluationPeriod(next)) {
      onChange(next);
    }
  };

  return (
    <Box sx={{ minWidth: 200, maxWidth: 320 }}>
      <Select
        id="prediction-evaluation-period"
        label="集計期間"
        size="sm"
        fullWidth
        value={value}
        onChange={handleChange}
        options={EVALUATION_PERIODS.map((period) => ({
          value: period,
          label: PERIOD_LABELS[period],
        }))}
      />
    </Box>
  );
}
