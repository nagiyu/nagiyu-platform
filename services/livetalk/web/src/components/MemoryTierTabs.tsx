'use client';

import { Box, Tab, Tabs, Tooltip } from '@mui/material';
import type { Tier } from '@nagiyu/livetalk-core';
import { TIER_DESCRIPTIONS, TIER_LABELS } from '@/lib/memory/format';
import { VISIBLE_TIERS } from '@/lib/memory/validation';

export interface MemoryTierTabsProps {
  value: Tier;
  onChange: (tier: Tier) => void;
}

/**
 * Tier A/B/C を切り替えるタブ。Tier D は一時的なので表示しない。
 * 各タブには Tier の説明をツールチップで添える。
 */
export default function MemoryTierTabs({ value, onChange }: MemoryTierTabsProps) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tabs
        value={value}
        onChange={(_e, next: Tier) => onChange(next)}
        aria-label="記憶の階層タブ"
        sx={{
          '& .MuiTab-root': { fontWeight: 500 },
          '& .Mui-selected': { fontWeight: 700 },
        }}
      >
        {VISIBLE_TIERS.map((tier) => (
          <Tooltip key={tier} title={TIER_DESCRIPTIONS[tier]} arrow>
            <Tab
              value={tier}
              label={`${TIER_LABELS[tier]}`}
              data-testid={`tier-tab-${tier}`}
              sx={{ minHeight: 48 }}
            />
          </Tooltip>
        ))}
      </Tabs>
    </Box>
  );
}
