'use client';

import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { SummariesResponse, TickerSummary } from '@/types/stock';

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
        {
          tickerId: 'NSDQ:GOOGL',
          symbol: 'GOOGL',
          name: 'Alphabet Inc.',
          open: 140.23,
          high: 142.57,
          low: 139.81,
          close: 141.80,
          updatedAt: '2024-01-15T21:00:00.000Z',
        },
        {
          tickerId: 'NSDQ:MSFT',
          symbol: 'MSFT',
          name: 'Microsoft Corporation',
          open: 374.50,
          high: 377.12,
          low: 373.08,
          close: 376.17,
          updatedAt: '2024-01-15T21:00:00.000Z',
        },
        {
          tickerId: 'NSDQ:AMZN',
          symbol: 'AMZN',
          name: 'Amazon.com Inc.',
          open: 153.20,
          high: 155.88,
          low: 152.64,
          close: 154.93,
          updatedAt: '2024-01-15T21:00:00.000Z',
        },
        {
          tickerId: 'NSDQ:NVDA',
          symbol: 'NVDA',
          name: 'NVIDIA Corporation',
          open: 495.30,
          high: 502.66,
          low: 492.14,
          close: 500.84,
          updatedAt: '2024-01-15T21:00:00.000Z',
        },
      ],
    },
    {
      exchangeId: 'NYSE',
      exchangeName: 'NYSE',
      date: '2024-01-15',
      summaries: [
        {
          tickerId: 'NYSE:JNJ',
          symbol: 'JNJ',
          name: 'Johnson & Johnson',
          open: 158.40,
          high: 159.73,
          low: 157.82,
          close: 159.12,
          updatedAt: '2024-01-15T21:00:00.000Z',
        },
        {
          tickerId: 'NYSE:JPM',
          symbol: 'JPM',
          name: 'JPMorgan Chase & Co.',
          open: 168.95,
          high: 171.20,
          low: 168.12,
          close: 170.54,
          updatedAt: '2024-01-15T21:00:00.000Z',
        },
        {
          tickerId: 'NYSE:KO',
          symbol: 'KO',
          name: 'The Coca-Cola Company',
          open: 59.85,
          high: 60.42,
          low: 59.61,
          close: 60.18,
          updatedAt: '2024-01-15T21:00:00.000Z',
        },
        {
          tickerId: 'NYSE:WMT',
          symbol: 'WMT',
          name: 'Walmart Inc.',
          open: 166.20,
          high: 167.95,
          low: 165.78,
          close: 167.43,
          updatedAt: '2024-01-15T21:00:00.000Z',
        },
      ],
    },
  ],
};

export default function SummariesPage() {
  const [selectedTicker, setSelectedTicker] = useState<TickerSummary | null>(null);

  const handleTickerClick = (ticker: TickerSummary) => {
    setSelectedTicker(ticker);
  };

  const handleDialogClose = () => {
    setSelectedTicker(null);
  };

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
                        <TableRow
                          key={summary.tickerId}
                          hover
                          onClick={() => handleTickerClick(summary)}
                          sx={{ cursor: 'pointer' }}
                        >
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

      <Dialog open={selectedTicker !== null} onClose={handleDialogClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {selectedTicker?.symbol}
          <IconButton onClick={handleDialogClose} size="small" aria-label="閉じる">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedTicker && (
            <Box sx={{ display: 'grid', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                銘柄名
              </Typography>
              <Typography>{selectedTicker.name}</Typography>
              <Divider />
              <Typography variant="body2" color="text.secondary">
                始値
              </Typography>
              <Typography>{selectedTicker.open.toFixed(2)}</Typography>
              <Divider />
              <Typography variant="body2" color="text.secondary">
                高値
              </Typography>
              <Typography>{selectedTicker.high.toFixed(2)}</Typography>
              <Divider />
              <Typography variant="body2" color="text.secondary">
                安値
              </Typography>
              <Typography>{selectedTicker.low.toFixed(2)}</Typography>
              <Divider />
              <Typography variant="body2" color="text.secondary">
                終値
              </Typography>
              <Typography>{selectedTicker.close.toFixed(2)}</Typography>
              <Divider />
              <Typography variant="body2" color="text.secondary">
                更新日時
              </Typography>
              <Typography>{new Date(selectedTicker.updatedAt).toLocaleString('ja-JP')}</Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
