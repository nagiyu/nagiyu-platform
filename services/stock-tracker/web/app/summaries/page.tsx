'use client';

import {
  Box,
  Card,
  CardContent,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { SummariesResponse } from '@/types/stock';

const mockData: SummariesResponse = {
  exchanges: [
    {
      exchangeId: 'NASDAQ',
      exchangeName: 'NASDAQ',
      date: '2024-01-15',
      summaries: [
        {
          tickerId: 'NSDQ:AAPL',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          open: 182.15,
          high: 183.92,
          low: 181.44,
          close: 183.31,
          updatedAt: '2024-01-15T21:00:00.000Z',
        },
      ],
    },
    {
      exchangeId: 'NYSE',
      exchangeName: 'NYSE',
      date: null,
      summaries: [],
    },
  ],
};

export default function SummariesPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
        日次サマリー
      </Typography>

      <Box sx={{ display: 'grid', gap: 2 }}>
        {mockData.exchanges.map((exchange) => (
          <Card key={exchange.exchangeId} variant="outlined">
            <CardContent>
              <Typography variant="h6" component="h2">
                {exchange.exchangeName}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                対象日: {exchange.date ?? '-'}
              </Typography>

              {exchange.summaries.length === 0 ? (
                <Typography color="text.secondary">データがありません</Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>シンボル</TableCell>
                        <TableCell>銘柄名</TableCell>
                        <TableCell align="right">始値</TableCell>
                        <TableCell align="right">高値</TableCell>
                        <TableCell align="right">安値</TableCell>
                        <TableCell align="right">終値</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {exchange.summaries.map((summary) => (
                        <TableRow key={summary.tickerId}>
                          <TableCell>{summary.symbol}</TableCell>
                          <TableCell>{summary.name}</TableCell>
                          <TableCell align="right">{summary.open.toFixed(2)}</TableCell>
                          <TableCell align="right">{summary.high.toFixed(2)}</TableCell>
                          <TableCell align="right">{summary.low.toFixed(2)}</TableCell>
                          <TableCell align="right">{summary.close.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        ))}
      </Box>
    </Container>
  );
}
