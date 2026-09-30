'use client';

import { Fragment, useState } from 'react';
import {
  Box,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import type { AxisBreakdown } from '../types/forecast';
import {
  FORECAST_TEXT,
  formatAxisPerformance,
  formatAxisValue,
  formatContribution,
} from '../lib/forecast-view/labels';

interface AxisBreakdownTableProps {
  axes: readonly AxisBreakdown[];
  /** テスト用の識別子の接頭辞 */
  testIdPrefix: string;
}

// モバイル幅では値・過去成績の列を隠し、行の展開で見せる
const DESKTOP_ONLY = { display: { xs: 'none', sm: 'table-cell' } } as const;
const MOBILE_ONLY = { display: { xs: 'table-row', sm: 'none' } } as const;

/** 軸ごとの内訳テーブル(軸名／値／過去成績／寄与) */
export default function AxisBreakdownTable({ axes, testIdPrefix }: AxisBreakdownTableProps) {
  const [expandedAxisIds, setExpandedAxisIds] = useState<ReadonlySet<string>>(new Set());

  const toggle = (axisId: string) => {
    setExpandedAxisIds((current) => {
      const next = new Set(current);
      if (next.has(axisId)) {
        next.delete(axisId);
      } else {
        next.add(axisId);
      }
      return next;
    });
  };

  return (
    <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
      <Table size="small" data-testid={`${testIdPrefix}-table`}>
        <TableHead>
          <TableRow>
            <TableCell>軸名</TableCell>
            <TableCell sx={DESKTOP_ONLY}>値</TableCell>
            <TableCell sx={DESKTOP_ONLY}>過去成績</TableCell>
            <TableCell align="right">寄与</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {axes.map((axis) => {
            const expanded = expandedAxisIds.has(axis.axisId);
            return (
              <Fragment key={axis.axisId}>
                <TableRow data-testid={`${testIdPrefix}-row-${axis.axisId}`}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        aria-label={`${axis.name}の詳細を${expanded ? '閉じる' : '開く'}`}
                        aria-expanded={expanded}
                        onClick={() => toggle(axis.axisId)}
                        sx={{
                          display: { xs: 'inline-flex', sm: 'none' },
                          // 閉じている=右向き、開いている=下向きにそろえる
                          transform: expanded ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.2s',
                        }}
                      >
                        <ChevronRightIcon fontSize="small" />
                      </IconButton>
                      <span>{axis.name}</span>
                    </Box>
                  </TableCell>
                  <TableCell sx={DESKTOP_ONLY}>{formatAxisValue(axis)}</TableCell>
                  <TableCell sx={DESKTOP_ONLY}>{formatAxisPerformance(axis)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {formatContribution(axis.contribution)}
                    {axis.lowSample && (
                      <Typography
                        component="span"
                        variant="caption"
                        color="warning.main"
                        sx={{ ml: 0.5 }}
                        data-testid={`${testIdPrefix}-low-sample-${axis.axisId}`}
                      >
                        {FORECAST_TEXT.LOW_SAMPLE_AXIS}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow sx={MOBILE_ONLY}>
                    <TableCell colSpan={2} sx={{ borderTop: 0 }}>
                      <Typography variant="body2">値: {formatAxisValue(axis)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        過去成績: {formatAxisPerformance(axis)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
