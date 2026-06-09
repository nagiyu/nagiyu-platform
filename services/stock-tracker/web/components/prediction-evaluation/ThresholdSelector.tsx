'use client';

import { Box } from '@mui/material';
import { Select } from '@nagiyu/ui';

/** 閾値プリセット一覧 (%) */
export const THRESHOLD_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0] as const;

export type ThresholdPreset = (typeof THRESHOLD_PRESETS)[number];

/** プリセットラベル */
const THRESHOLD_LABELS: Record<ThresholdPreset, string> = {
  0.25: '0.25%',
  0.5: '0.50%（デフォルト）',
  0.75: '0.75%',
  1.0: '1.00%',
  1.5: '1.50%',
  2.0: '2.00%',
};

export interface ThresholdSelectorProps {
  /** 現在の閾値 (%) */
  value: number;
  /** 閾値変更時のコールバック */
  onChange: (v: number) => void;
}

const isThresholdPreset = (value: number): value is ThresholdPreset =>
  (THRESHOLD_PRESETS as readonly number[]).includes(value);

export default function ThresholdSelector({ value, onChange }: ThresholdSelectorProps) {
  const handleChange = (next: string) => {
    const parsed = parseFloat(next);
    if (isThresholdPreset(parsed)) {
      onChange(parsed);
    }
  };

  return (
    <Box sx={{ minWidth: 200, maxWidth: 320 }}>
      <Select
        id="prediction-evaluation-threshold"
        label="Hit 判定閾値"
        size="sm"
        fullWidth
        value={String(value)}
        onChange={handleChange}
        options={THRESHOLD_PRESETS.map((preset) => ({
          value: String(preset),
          label: THRESHOLD_LABELS[preset],
        }))}
      />
    </Box>
  );
}
