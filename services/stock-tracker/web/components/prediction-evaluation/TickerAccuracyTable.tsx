'use client';

import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { TickerAccuracyEntry } from '@/lib/prediction-evaluation/types';

export interface TickerAccuracyTableProps {
  data: TickerAccuracyEntry[];
  minCount: number;
}

export const formatHitRatio = (hit: number, total: number): string => {
  if (total === 0) {
    return '—';
  }
  const ratio = (hit / total) * 100;
  return `${ratio.toFixed(1)}% (${hit}/${total})`;
};

export default function TickerAccuracyTable({ data, minCount }: TickerAccuracyTableProps) {
  const sorted = [...data].sort((a, b) => b.accuracy - a.accuracy);

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Typography variant="h6" component="h2">
          銘柄別精度
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {`判定件数 ≥ ${minCount} の銘柄のみ`}
        </Typography>
      </Box>
      {sorted.length === 0 ? (
        <Typography color="text.secondary">表示できるデータがありません</Typography>
      ) : (
        <TableContainer sx={{ maxHeight: 480 }}>
          <Table size="small" stickyHeader aria-label="銘柄別精度テーブル">
            <TableHead>
              <TableRow>
                <TableCell>銘柄</TableCell>
                <TableCell>取引所</TableCell>
                <TableCell align="right">方向精度</TableCell>
                <TableCell align="right">判定件数</TableCell>
                <TableCell align="right">BULLISH 的中</TableCell>
                <TableCell align="right">BEARISH 的中</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((entry) => (
                <TableRow
                  key={entry.tickerId}
                  hover
                  data-testid={`ticker-row-${entry.tickerId}`}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {entry.tickerId}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.tickerName}
                    </Typography>
                  </TableCell>
                  <TableCell>{entry.exchangeId}</TableCell>
                  <TableCell align="right">{entry.accuracy.toFixed(1)}%</TableCell>
                  <TableCell align="right">{entry.count.toLocaleString('ja-JP')}</TableCell>
                  <TableCell align="right">
                    {formatHitRatio(entry.bullishHit, entry.bullishTotal)}
                  </TableCell>
                  <TableCell align="right">
                    {formatHitRatio(entry.bearishHit, entry.bearishTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
