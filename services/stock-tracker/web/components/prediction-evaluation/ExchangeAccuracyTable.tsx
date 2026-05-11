'use client';

import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { ExchangeAccuracyEntry } from '@/lib/prediction-evaluation/types';

export interface ExchangeAccuracyTableProps {
  data: ExchangeAccuracyEntry[];
}

const NA = '—';

export default function ExchangeAccuracyTable({ data }: ExchangeAccuracyTableProps) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        取引所別精度
      </Typography>
      {data.length === 0 ? (
        <Typography color="text.secondary">表示できるデータがありません</Typography>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="取引所別精度テーブル">
            <TableHead>
              <TableRow>
                <TableCell>取引所</TableCell>
                <TableCell align="right">精度</TableCell>
                <TableCell align="right">判定件数</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((entry) => (
                <TableRow key={entry.exchangeId} data-testid={`exchange-row-${entry.exchangeId}`}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {entry.exchangeName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.exchangeId}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {entry.accuracy === null ? NA : `${entry.accuracy.toFixed(1)}%`}
                  </TableCell>
                  <TableCell align="right">{entry.count.toLocaleString('ja-JP')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
