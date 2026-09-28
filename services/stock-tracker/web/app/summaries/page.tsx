'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
  TableSortLabel,
  Typography,
} from '@mui/material';
import { Button, ErrorAlert, Select } from '@nagiyu/ui';
import { useSession } from 'next-auth/react';
import { hasPermission } from '@nagiyu/common';
import type { SummariesResponse, TickerSummary } from '@/types/stock';
import SummaryDetailDialog from '../../components/SummaryDetailDialog';
import ForecastLabelChip from '../../components/ForecastLabelChip';
import MarketForecastCards from '../../components/MarketForecastCards';
import { formatLit, resolveUnavailableReason } from '../../lib/forecast-view/labels';
import {
  nextSortState,
  sortByForecast,
  type ForecastSortColumn,
  type ForecastSortState,
} from '../../lib/forecast-view/sort';

const ERROR_MESSAGES = {
  FETCH_FAILED: 'サマリーの取得に失敗しました',
  REFRESH_FAILED: 'サマリーバッチの実行に失敗しました',
  REFRESH_SUCCESS: 'サマリーバッチを実行しました',
} as const;

const getAriaSort = (
  sort: ForecastSortState | null,
  column: ForecastSortColumn
): 'ascending' | 'descending' | 'none' => {
  if (sort?.column !== column) {
    return 'none';
  }
  return sort.direction === 'asc' ? 'ascending' : 'descending';
};

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

const formatAlertCount = (enabledCount: number, disabledCount: number): string => {
  if (enabledCount === 0 && disabledCount === 0) {
    return '0';
  }

  if (disabledCount > 0) {
    return `${enabledCount} (${disabledCount})`;
  }

  return `${enabledCount}`;
};

export default function SummariesPage() {
  const { data: session } = useSession();
  const [summaries, setSummaries] = useState<SummariesResponse>({
    exchanges: [],
    marketForecasts: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [selectedExchangeId, setSelectedExchangeId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<TickerSummary | null>(null);
  const [sort, setSort] = useState<ForecastSortState | null>(null);
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
      setSummaries({ exchanges: [], marketForecasts: [] });
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

  const handleSortClick = (column: ForecastSortColumn) => {
    setSort((current) => nextSortState(current, column));
  };

  const handleDialogClose = () => setSelectedTicker(null);
  const filteredExchanges = selectedExchangeId
    ? summaries.exchanges.filter((exchange) => exchange.exchangeId === selectedExchangeId)
    : summaries.exchanges;
  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
        日次サマリー
      </Typography>
      <MarketForecastCards marketForecasts={summaries.marketForecasts} />
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 220 }}>
          <Select
            id="exchange-filter"
            label="取引所"
            size="sm"
            fullWidth
            value={selectedExchangeId}
            onChange={setSelectedExchangeId}
            options={[
              { value: '', label: 'すべての取引所' },
              ...summaries.exchanges.map((exchange) => ({
                value: exchange.exchangeId,
                label: exchange.exchangeName,
              })),
            ]}
          />
        </Box>
        {hasManageDataPermission && (
          <Button variant="solid" onClick={handleRefresh} loading={isRefreshing}>
            サマリー更新
          </Button>
        )}
      </Box>

      {errorMessage && <ErrorAlert message={errorMessage} />}
      {refreshMessage && (
        <Alert
          severity={refreshMessage === ERROR_MESSAGES.REFRESH_SUCCESS ? 'success' : 'error'}
          sx={{ mb: 2 }}
        >
          {refreshMessage}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'minmax(0, 1fr)' }}>
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
                  <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                    <Table
                      size="small"
                      sx={{ minWidth: 820, '& .MuiTableCell-root': { whiteSpace: 'nowrap' } }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>シンボル</TableCell>
                          <TableCell>銘柄名</TableCell>
                          <TableCell align="center">保有</TableCell>
                          {(['dir', 'vol'] as const).map((column) => (
                            <TableCell
                              key={column}
                              align="right"
                              aria-sort={getAriaSort(sort, column)}
                            >
                              <TableSortLabel
                                active={sort?.column === column}
                                direction={sort?.column === column ? sort.direction : 'desc'}
                                onClick={() => handleSortClick(column)}
                                data-testid={`sort-${column}`}
                              >
                                {column === 'dir' ? '方向' : '荒れ'}
                              </TableSortLabel>
                            </TableCell>
                          ))}
                          <TableCell align="right">点灯</TableCell>
                          <TableCell align="right">買いアラート数</TableCell>
                          <TableCell align="right">売りアラート数</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sortByForecast(exchange.summaries, sort).map((summary) => (
                          <TableRow
                            key={summary.tickerId}
                            hover
                            onClick={() => handleTickerClick(summary)}
                            sx={{ cursor: 'pointer' }}
                          >
                            <TableCell>{summary.symbol}</TableCell>
                            <TableCell>{summary.name}</TableCell>
                            <TableCell align="center">{summary.holding ? '✓' : '-'}</TableCell>
                            <TableCell align="right" data-testid={`dir-${summary.tickerId}`}>
                              <ForecastLabelChip
                                question="DIR"
                                view={summary.forecast?.dir}
                                unavailableReason={resolveUnavailableReason(
                                  'DIR',
                                  summary.forecast
                                )}
                              />
                            </TableCell>
                            <TableCell align="right" data-testid={`vol-${summary.tickerId}`}>
                              <ForecastLabelChip
                                question="VOL"
                                view={summary.forecast?.vol}
                                unavailableReason={resolveUnavailableReason(
                                  'VOL',
                                  summary.forecast
                                )}
                              />
                            </TableCell>
                            <TableCell align="right" data-testid={`lit-${summary.tickerId}`}>
                              {formatLit(summary.forecast?.lit)}
                            </TableCell>
                            <TableCell align="right" data-testid={`buy-alert-${summary.tickerId}`}>
                              {formatAlertCount(
                                summary.buyAlertCount?.enabled ?? 0,
                                summary.buyAlertCount?.disabled ?? 0
                              )}
                            </TableCell>
                            <TableCell align="right" data-testid={`sell-alert-${summary.tickerId}`}>
                              {formatAlertCount(
                                summary.sellAlertCount?.enabled ?? 0,
                                summary.sellAlertCount?.disabled ?? 0
                              )}
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

      <SummaryDetailDialog
        open={selectedTicker !== null}
        summary={selectedTicker}
        onClose={handleDialogClose}
      />
    </Container>
  );
}
