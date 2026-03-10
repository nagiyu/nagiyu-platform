'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useSession } from 'next-auth/react';
import { hasPermission } from '@nagiyu/common';
import type { PatternDetail, SummariesResponse, TickerSummary } from '@/types/stock';
import { resolveAiAnalysisText } from './ai-analysis';
import AlertSettingsModal from '../../components/AlertSettingsModal';
import StockChart from '../../components/StockChart';

const ERROR_MESSAGES = {
  FETCH_FAILED: 'サマリーの取得に失敗しました',
  REFRESH_FAILED: 'サマリーバッチの実行に失敗しました',
  REFRESH_SUCCESS: 'サマリーバッチを実行しました',
  INSUFFICIENT_DATA_REASON: 'データ不足',
} as const;
const UI_DISPLAY_VALUES = {
  NOT_AVAILABLE: '-',
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

const extractExchangeId = (tickerId: string): string => {
  const [exchangeId, symbol] = tickerId.split(':');
  return exchangeId && symbol ? exchangeId : '';
};

export default function SummariesPage() {
  const { data: session } = useSession();
  const [summaries, setSummaries] = useState<SummariesResponse>({ exchanges: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [selectedExchangeId, setSelectedExchangeId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<TickerSummary | null>(null);
  const [isBuyAlertOpen, setIsBuyAlertOpen] = useState(false);
  const [isSellAlertOpen, setIsSellAlertOpen] = useState(false);
  const hasManageDataPermission =
    !!session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'stocks:manage-data');

  const fetchSummaries = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/summaries');

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
      setSelectedExchangeId((currentExchangeId) =>
        data.exchanges.some((exchange) => exchange.exchangeId === currentExchangeId)
          ? currentExchangeId
          : ''
      );
    } catch (error) {
      setSummaries({ exchanges: [] });
      setErrorMessage(error instanceof Error ? error.message : ERROR_MESSAGES.FETCH_FAILED);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummaries();
  }, [fetchSummaries]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      const response = await fetch('/api/summaries/refresh', { method: 'POST' });
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.REFRESH_FAILED);
      }
      setRefreshMessage(ERROR_MESSAGES.REFRESH_SUCCESS);
      await fetchSummaries();
    } catch {
      setRefreshMessage(ERROR_MESSAGES.REFRESH_FAILED);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTickerClick = (ticker: TickerSummary) => {
    setSelectedTicker(ticker);
  };

  const handleDialogClose = () => {
    setIsBuyAlertOpen(false);
    setIsSellAlertOpen(false);
    setSelectedTicker(null);
  };
  const filteredExchanges = selectedExchangeId
    ? summaries.exchanges.filter((exchange) => exchange.exchangeId === selectedExchangeId)
    : summaries.exchanges;
  const buyPatternDetails: PatternDetail[] = (selectedTicker?.patternDetails ?? []).filter(
    (pattern) => pattern.signalType === 'BUY'
  );
  const sellPatternDetails: PatternDetail[] = (selectedTicker?.patternDetails ?? []).filter(
    (pattern) => pattern.signalType === 'SELL'
  );
  const selectedTickerExchangeId = selectedTicker ? extractExchangeId(selectedTicker.tickerId) : '';
  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
        日次サマリー
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="exchange-filter-label">取引所</InputLabel>
          <Select
            labelId="exchange-filter-label"
            value={selectedExchangeId}
            label="取引所"
            onChange={(event) => setSelectedExchangeId(event.target.value)}
          >
            <MenuItem value="">すべての取引所</MenuItem>
            {summaries.exchanges.map((exchange) => (
              <MenuItem key={exchange.exchangeId} value={exchange.exchangeId}>
                {exchange.exchangeName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {hasManageDataPermission && (
          <Button variant="contained" onClick={handleRefresh} disabled={isRefreshing}>
            サマリー更新
          </Button>
        )}
      </Box>

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}
      {refreshMessage && (
        <Alert
          severity={refreshMessage === ERROR_MESSAGES.REFRESH_SUCCESS ? 'success' : 'error'}
          sx={{ mb: 2 }}
        >
          {refreshMessage}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2 }}>
        {isLoading ? (
          <Typography color="text.secondary">読み込み中...</Typography>
        ) : (
          filteredExchanges.map((exchange) => (
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
                          <TableCell align="center">保有</TableCell>
                          <TableCell align="right">始値</TableCell>
                          <TableCell align="right">高値</TableCell>
                          <TableCell align="right">安値</TableCell>
                          <TableCell align="right">終値</TableCell>
                          <TableCell align="right">買いシグナル</TableCell>
                          <TableCell align="right">売りシグナル</TableCell>
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
                            <TableCell align="center">{summary.holding ? '✓' : '-'}</TableCell>
                            <TableCell align="right">{summary.open.toFixed(2)}</TableCell>
                            <TableCell align="right">{summary.high.toFixed(2)}</TableCell>
                            <TableCell align="right">{summary.low.toFixed(2)}</TableCell>
                            <TableCell align="right">{summary.close.toFixed(2)}</TableCell>
                            <TableCell align="right" data-testid={`buy-signal-${summary.tickerId}`}>
                              {summary.buyPatternCount ?? 0}
                            </TableCell>
                            <TableCell
                              align="right"
                              data-testid={`sell-signal-${summary.tickerId}`}
                            >
                              {summary.sellPatternCount ?? 0}
                            </TableCell>
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

      <Dialog open={selectedTicker !== null} onClose={handleDialogClose} maxWidth="md" fullWidth>
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
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Typography variant="h6">株価チャート</Typography>
              <StockChart
                tickerId={selectedTicker.tickerId}
                timeframe="D"
                count={50}
                holdingPrice={selectedTicker.holding?.averagePrice}
              />
              <Divider />
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell
                        component="th"
                        scope="row"
                        sx={{ color: 'text.secondary', width: '40%' }}
                      >
                        銘柄名
                      </TableCell>
                      <TableCell>{selectedTicker.name}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        始値
                      </TableCell>
                      <TableCell align="right">{selectedTicker.open.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        高値
                      </TableCell>
                      <TableCell align="right">{selectedTicker.high.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        安値
                      </TableCell>
                      <TableCell align="right">{selectedTicker.low.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        終値
                      </TableCell>
                      <TableCell align="right">{selectedTicker.close.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        出来高
                      </TableCell>
                      <TableCell align="right">
                        {selectedTicker.volume?.toLocaleString('ja-JP') ??
                          UI_DISPLAY_VALUES.NOT_AVAILABLE}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        保有数
                      </TableCell>
                      <TableCell>
                        {selectedTicker.holding?.quantity.toLocaleString('ja-JP') ?? '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        平均取得価格
                      </TableCell>
                      <TableCell>
                        {selectedTicker.holding
                          ? selectedTicker.holding.averagePrice.toFixed(2)
                          : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ color: 'text.secondary' }}>
                        更新日時
                      </TableCell>
                      <TableCell>
                        {new Date(selectedTicker.updatedAt).toLocaleString('ja-JP')}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              <Divider />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={() => setIsBuyAlertOpen(true)}>
                  買いアラート設定
                </Button>
                {selectedTicker.holding && (
                  <Button variant="outlined" onClick={() => setIsSellAlertOpen(true)}>
                    売りアラート設定
                  </Button>
                )}
              </Box>
              <Divider />
              <Typography variant="h6">パターン分析</Typography>
              <Box sx={{ display: 'grid', gap: 1 }} data-testid="pattern-analysis-buy">
                <Typography variant="subtitle2">買いパターン</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      {buyPatternDetails.map((pattern) => (
                        <TableRow key={pattern.patternId}>
                          <TableCell>
                            <Tooltip title={pattern.description}>
                              <Typography
                                component="span"
                                variant="body2"
                                aria-label={pattern.description}
                                sx={{
                                  textDecoration: 'underline',
                                  textDecorationStyle: 'dotted',
                                  cursor: 'help',
                                }}
                              >
                                {pattern.name}
                              </Typography>
                            </Tooltip>
                            {pattern.status === 'INSUFFICIENT_DATA' && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                理由: {ERROR_MESSAGES.INSUFFICIENT_DATA_REASON}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ width: '10%' }}>
                            <Typography
                              component="span"
                              data-testid={`pattern-status-${pattern.patternId}`}
                              color={
                                pattern.status === 'MATCHED'
                                  ? 'success.main'
                                  : pattern.status === 'INSUFFICIENT_DATA'
                                    ? 'text.disabled'
                                    : 'text.secondary'
                              }
                              fontWeight="bold"
                            >
                              {pattern.status === 'MATCHED'
                                ? '✓'
                                : pattern.status === 'INSUFFICIENT_DATA'
                                  ? '-'
                                  : '✗'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
              <Box sx={{ display: 'grid', gap: 1 }} data-testid="pattern-analysis-sell">
                <Typography variant="subtitle2">売りパターン</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      {sellPatternDetails.map((pattern) => (
                        <TableRow key={pattern.patternId}>
                          <TableCell>
                            <Tooltip title={pattern.description}>
                              <Typography
                                component="span"
                                variant="body2"
                                aria-label={pattern.description}
                                sx={{
                                  textDecoration: 'underline',
                                  textDecorationStyle: 'dotted',
                                  cursor: 'help',
                                }}
                              >
                                {pattern.name}
                              </Typography>
                            </Tooltip>
                            {pattern.status === 'INSUFFICIENT_DATA' && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                理由: {ERROR_MESSAGES.INSUFFICIENT_DATA_REASON}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ width: '10%' }}>
                            <Typography
                              component="span"
                              data-testid={`pattern-status-${pattern.patternId}`}
                              color={
                                pattern.status === 'MATCHED'
                                  ? 'success.main'
                                  : pattern.status === 'INSUFFICIENT_DATA'
                                    ? 'text.disabled'
                                    : 'text.secondary'
                              }
                              fontWeight="bold"
                            >
                              {pattern.status === 'MATCHED'
                                ? '✓'
                                : pattern.status === 'INSUFFICIENT_DATA'
                                  ? '-'
                                  : '✗'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
              <Box component="section" aria-labelledby="ai-analysis-heading">
                <Divider sx={{ mb: 2 }} />
                <Typography id="ai-analysis-heading" variant="h6">
                  AI 解析
                </Typography>
                <TextField
                  value={resolveAiAnalysisText(selectedTicker)}
                  multiline
                  fullWidth
                  rows={10}
                  aria-labelledby="ai-analysis-heading"
                  InputProps={{
                    readOnly: true,
                    sx: {
                      '& textarea': {
                        overflowY: 'auto',
                      },
                    },
                  }}
                />
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
      {selectedTicker && (
        <>
          <AlertSettingsModal
            open={isBuyAlertOpen}
            onClose={() => setIsBuyAlertOpen(false)}
            tickerId={selectedTicker.tickerId}
            symbol={selectedTicker.symbol}
            exchangeId={selectedTickerExchangeId}
            mode="create"
            tradeMode="Buy"
            defaultTargetPrice={selectedTicker.close}
            basePrice={selectedTicker.close}
          />
          <AlertSettingsModal
            open={isSellAlertOpen}
            onClose={() => setIsSellAlertOpen(false)}
            tickerId={selectedTicker.tickerId}
            symbol={selectedTicker.symbol}
            exchangeId={selectedTickerExchangeId}
            mode="create"
            tradeMode="Sell"
            defaultTargetPrice={selectedTicker.close}
            basePrice={selectedTicker.close}
          />
        </>
      )}
    </Container>
  );
}
