'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
  TextField,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { SummariesResponse, TickerSummary } from '@/types/stock';

const ERROR_MESSAGES = {
  FETCH_FAILED: 'サマリーの取得に失敗しました',
} as const;

const formatLatestUpdatedAt = (summaries: TickerSummary[]): string => {
  const latest = summaries.reduce<number | null>((currentMax, summary) => {
    const timestamp = Date.parse(summary.updatedAt);
    if (Number.isNaN(timestamp)) {
      return currentMax;
    }

    if (currentMax === null || timestamp > currentMax) {
      return timestamp;
    }

    return currentMax;
  }, null);

  return latest === null ? '-' : new Date(latest).toLocaleString('ja-JP');
};

export default function SummariesPage() {
  const [summaries, setSummaries] = useState<SummariesResponse>({ exchanges: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('');
  const [selectedTicker, setSelectedTicker] = useState<TickerSummary | null>(null);

  const fetchSummaries = useCallback(async (date: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const searchParams = new URLSearchParams();
      if (date) {
        searchParams.set('date', date);
      }

      const query = searchParams.toString();
      const response = await fetch(`/api/summaries${query ? `?${query}` : ''}`);

      if (!response.ok) {
        let message: string = ERROR_MESSAGES.FETCH_FAILED;
        try {
          const errorResponse = (await response.json()) as { message?: string };
          message = errorResponse.message ?? message;
        } catch {
          // no-op
        }
        throw new Error(message);
      }

      const data = (await response.json()) as SummariesResponse;
      setSummaries(data);
    } catch (error) {
      setSummaries({ exchanges: [] });
      setErrorMessage(error instanceof Error ? error.message : ERROR_MESSAGES.FETCH_FAILED);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const initialDate = searchParams.get('date') ?? '';
    setDateFilter(initialDate);
    void fetchSummaries(initialDate);
  }, [fetchSummaries]);

  const handleDateFilterChange = (value: string) => {
    setDateFilter(value);
    const searchParams = new URLSearchParams(window.location.search);
    if (value) {
      searchParams.set('date', value);
    } else {
      searchParams.delete('date');
    }
    const query = searchParams.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    void fetchSummaries(value);
  };

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
      <TextField
        label="対象日"
        type="date"
        size="small"
        value={dateFilter}
        onChange={(event) => handleDateFilterChange(event.target.value)}
        sx={{ mb: 2 }}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2 }}>
        {isLoading ? (
          <Typography color="text.secondary">読み込み中...</Typography>
        ) : (
          summaries.exchanges.map((exchange) => (
            <Card key={exchange.exchangeId} variant="outlined">
              <CardContent>
                <Typography variant="h6" component="h2">
                  {exchange.exchangeName}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  対象日: {exchange.date ?? '-'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  最新更新: {formatLatestUpdatedAt(exchange.summaries)}
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
          ))
        )}
      </Box>

      <Dialog open={selectedTicker !== null} onClose={handleDialogClose} maxWidth="xs" fullWidth>
        <DialogTitle
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
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
