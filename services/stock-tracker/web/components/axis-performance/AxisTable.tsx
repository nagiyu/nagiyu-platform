'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  ClickAwayListener,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import { Chip } from '@nagiyu/ui';
import type { AxisPerformanceAxis, ForecastQuestion } from '../../types/forecast';
import {
  KIND_LABELS,
  buildAxisDescription,
  formatCount,
  formatPercent,
  formatSignedPercent,
  formatSignedPt,
  formatWeight,
  NOT_AVAILABLE,
} from '../../lib/axis-performance-view/format';
import {
  sortAxes,
  toggleSort,
  weightBarRatio,
  type AxisSort,
  type AxisSortKey,
} from '../../lib/axis-performance-view/sort';

export interface AxisTableProps {
  question: ForecastQuestion;
  axes: AxisPerformanceAxis[];
}

interface Column {
  key: AxisSortKey;
  label: string;
  align: 'left' | 'right';
  /** モバイル幅でも出す列。ほかは md 以上で出す */
  priority: boolean;
}

const COLUMNS: Column[] = [
  { key: 'name', label: '軸名', align: 'left', priority: true },
  { key: 'kind', label: '種類', align: 'left', priority: false },
  { key: 'count', label: '件数', align: 'right', priority: true },
  { key: 'hitRate', label: '的中率', align: 'right', priority: false },
  { key: 'diffFromBaseline', label: 'ふだんとの差', align: 'right', priority: true },
  { key: 'meanExcessReturn', label: '平均超過リターン', align: 'right', priority: false },
  { key: 'currentWeight', label: '現在の重み', align: 'right', priority: true },
];

const cellDisplay = (priority: boolean) =>
  priority ? undefined : { xs: 'none', md: 'table-cell' };

export default function AxisTable({ question, axes }: AxisTableProps) {
  const [sort, setSort] = useState<AxisSort | null>(null);
  const [openAxisId, setOpenAxisId] = useState<string | null>(null);

  // 平均超過リターンは方向タブでのみ API が返す
  const columns = COLUMNS.filter(
    (column) => column.key !== 'meanExcessReturn' || question === 'DIR'
  );
  const sorted = useMemo(() => sortAxes(axes, sort), [axes, sort]);
  const maxAbsWeight = useMemo(
    () => axes.reduce((max, axis) => Math.max(max, Math.abs(axis.currentWeight)), 0),
    [axes]
  );

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="axis-table-section">
      <Typography variant="h6" component="h2" gutterBottom>
        軸ごとの成績
      </Typography>
      <TableContainer>
        <Table size="small" aria-label="軸ごとの成績">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.align}
                  sx={{ display: cellDisplay(column.priority) }}
                  sortDirection={sort?.key === column.key ? sort.direction : false}
                >
                  <TableSortLabel
                    active={sort?.key === column.key}
                    direction={sort?.key === column.key ? sort.direction : 'desc'}
                    onClick={() => setSort((current) => toggleSort(current, column.key))}
                  >
                    {column.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((axis) => (
              <TableRow key={axis.axisId} data-testid="axis-row">
                <TableCell>
                  <ClickAwayListener
                    onClickAway={() => setOpenAxisId((id) => (id === axis.axisId ? null : id))}
                  >
                    <Tooltip
                      open={openAxisId === axis.axisId}
                      title={buildAxisDescription(axis, question)}
                      placement="bottom-start"
                      disableFocusListener
                      disableHoverListener
                      disableTouchListener
                    >
                      <Box
                        component="button"
                        type="button"
                        sx={{
                          p: 0,
                          border: 0,
                          bgcolor: 'transparent',
                          color: 'inherit',
                          font: 'inherit',
                          textAlign: 'left',
                          textDecoration: 'underline dotted',
                          cursor: 'pointer',
                        }}
                        onClick={() =>
                          setOpenAxisId((id) => (id === axis.axisId ? null : axis.axisId))
                        }
                      >
                        {axis.name}
                      </Box>
                    </Tooltip>
                  </ClickAwayListener>
                  {axis.lowSample && (
                    <Box component="span" sx={{ ml: 1 }}>
                      <Chip size="sm" color="warning" variant="outline">
                        件数不足
                      </Chip>
                    </Box>
                  )}
                </TableCell>
                <TableCell sx={{ display: cellDisplay(false) }}>{KIND_LABELS[axis.kind]}</TableCell>
                <TableCell align="right">{formatCount(axis.count)}</TableCell>
                <TableCell align="right" sx={{ display: cellDisplay(false) }}>
                  {formatPercent(axis.hitRate)}
                </TableCell>
                <TableCell align="right">{formatSignedPt(axis.diffFromBaseline)}</TableCell>
                {question === 'DIR' && (
                  <TableCell align="right" sx={{ display: cellDisplay(false) }}>
                    {axis.meanExcessReturn === undefined
                      ? NOT_AVAILABLE
                      : formatSignedPercent(axis.meanExcessReturn)}
                  </TableCell>
                )}
                <TableCell align="right">
                  <WeightCell weight={axis.currentWeight} maxAbsWeight={maxAbsWeight} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

/** 重みを、符号付きの数値と中央から左右に伸びる棒で表す */
function WeightCell({ weight, maxAbsWeight }: { weight: number; maxAbsWeight: number }) {
  const ratio = weightBarRatio(weight, maxAbsWeight);
  const positive = weight >= 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
      <Box
        aria-hidden
        sx={{
          position: 'relative',
          width: 80,
          height: 8,
          display: { xs: 'none', sm: 'block' },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: '1px',
            bgcolor: 'divider',
          }}
        />
        <Box
          data-testid="weight-bar"
          data-sign={positive ? 'plus' : 'minus'}
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: `${ratio * 50}%`,
            ...(positive ? { left: '50%' } : { right: '50%' }),
            bgcolor: positive ? 'primary.main' : 'error.main',
          }}
        />
      </Box>
      <Box component="span" sx={{ minWidth: 48, textAlign: 'right' }}>
        {formatWeight(weight)}
      </Box>
    </Box>
  );
}
