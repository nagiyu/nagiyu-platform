'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Container,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  SelectChangeEvent,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { ErrorAlert } from '@nagiyu/ui';
import type { Timeframe, ChartBarCount } from '@/types/stock';
import type { TickerSummary } from '@/types/stock';
import type { AlertResponse } from '@/types/alert';
import {
  TIMEFRAME_LABELS,
  CHART_BAR_COUNTS,
  CHART_BAR_COUNT_LABELS,
  DEFAULT_CHART_BAR_COUNT,
} from '@/types/stock';
import { computeAlertLines } from '@/lib/chart-overlay-lines';
import StockChart from './StockChart';
import EmptyState from './EmptyState';
import TickerSummaryCard from './TickerSummaryCard';
import HoldingCard from './HoldingCard';
import type { HoldingResponse } from '@/types/holding';
import TickerAlertListCard from './TickerAlertListCard';

// API レスポンス型定義
interface Exchange {
  exchangeId: string;
  name: string;
  key: string;
  timezone: string;
  tradingHours: {
    start: string;
    end: string;
  };
}

interface Ticker {
  tickerId: string;
  symbol: string;
  name: string;
  exchangeId: string;
}

// エラーメッセージ定数
const ERROR_MESSAGES = {
  FETCH_EXCHANGES_ERROR: '取引所一覧の取得に失敗しました。ネットワーク接続を確認してください。',
  FETCH_TICKERS_ERROR: 'ティッカー一覧の取得に失敗しました。ネットワーク接続を確認してください。',
  FETCH_SUMMARY_ERROR: 'サマリーの取得に失敗しました',
  FETCH_HOLDING_ERROR: '保有株式の取得に失敗しました',
  FETCH_ALERTS_ERROR: 'アラート情報の取得に失敗しました',
} as const;

interface HomePageClientProps {
  children?: React.ReactNode;
}

export default function HomePageClient({ children }: HomePageClientProps) {
  const searchParams = useSearchParams();
  const initialSelectionAppliedRef = useRef<{ exchange: boolean; ticker: boolean }>({
    exchange: false,
    ticker: false,
  });

  const queryExchangeId = searchParams.get('exchangeId') || '';
  const queryTickerId = searchParams.get('tickerId') || '';

  // 選択状態の管理
  const [exchange, setExchange] = useState<string>('');
  const [ticker, setTicker] = useState<string>('');
  const [timeframe, setTimeframe] = useState<Timeframe>('60');
  const [barCount, setBarCount] = useState<ChartBarCount>(DEFAULT_CHART_BAR_COUNT);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  // データ状態の管理
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [summary, setSummary] = useState<TickerSummary | null>(null);
  const [holding, setHolding] = useState<HoldingResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);

  // ローディング状態の管理
  const [exchangesLoading, setExchangesLoading] = useState<boolean>(false);
  const [tickersLoading, setTickersLoading] = useState<boolean>(false);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [holdingLoading, setHoldingLoading] = useState<boolean>(false);
  const [alertsLoading, setAlertsLoading] = useState<boolean>(false);

  // エラー状態の管理
  const [exchangesError, setExchangesError] = useState<string>('');
  const [tickersError, setTickersError] = useState<string>('');
  const [summaryError, setSummaryError] = useState<string>('');
  const [holdingError, setHoldingError] = useState<string>('');
  const [alertsError, setAlertsError] = useState<string>('');
  const alertLines = useMemo(
    () =>
      alerts
        .filter((alert) => alert.enabled)
        .flatMap((alert) => computeAlertLines(alert.conditions)),
    [alerts]
  );

  const fetchHoldingByTicker = async (targetTicker: string): Promise<HoldingResponse | null> => {
    const response = await fetch(`/api/holdings/tickers/${encodeURIComponent(targetTicker)}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(ERROR_MESSAGES.FETCH_HOLDING_ERROR);
    }
    return (await response.json()) as HoldingResponse;
  };

  const fetchAlertsByTicker = async (targetTicker: string): Promise<AlertResponse[]> => {
    const response = await fetch(`/api/alerts/tickers/${encodeURIComponent(targetTicker)}`);
    if (!response.ok) {
      throw new Error(ERROR_MESSAGES.FETCH_ALERTS_ERROR);
    }
    const data = (await response.json()) as { alerts?: AlertResponse[] };
    return data.alerts ?? [];
  };

  const refreshHoldingAndAlerts = async () => {
    if (!ticker) {
      return;
    }

    setHoldingLoading(true);
    setAlertsLoading(true);
    setHoldingError('');
    setAlertsError('');

    try {
      const [holdingResult, alertsResult] = await Promise.allSettled([
        fetchHoldingByTicker(ticker),
        fetchAlertsByTicker(ticker),
      ]);

      if (holdingResult.status === 'fulfilled') {
        setHolding(holdingResult.value);
      } else {
        setHoldingError(ERROR_MESSAGES.FETCH_HOLDING_ERROR);
      }

      if (alertsResult.status === 'fulfilled') {
        setAlerts(alertsResult.value);
      } else {
        setAlertsError(ERROR_MESSAGES.FETCH_ALERTS_ERROR);
      }
    } finally {
      setHoldingLoading(false);
      setAlertsLoading(false);
    }
  };

  // 取引所一覧を取得
  useEffect(() => {
    const fetchExchanges = async () => {
      setExchangesLoading(true);
      setExchangesError('');

      try {
        const response = await fetch('/api/exchanges');
        if (!response.ok) {
          throw new Error(ERROR_MESSAGES.FETCH_EXCHANGES_ERROR);
        }

        const data = await response.json();
        setExchanges(data.exchanges || []);
      } catch (error) {
        console.error('Error fetching exchanges:', error);
        setExchangesError(ERROR_MESSAGES.FETCH_EXCHANGES_ERROR);
      } finally {
        setExchangesLoading(false);
      }
    };

    fetchExchanges();
  }, []);

  // 取引所選択時にティッカー一覧を取得
  useEffect(() => {
    if (!exchange) {
      setTickers([]);
      setTicker(''); // 取引所がクリアされた場合はティッカーもリセット
      return;
    }

    const fetchTickers = async () => {
      setTickersLoading(true);
      setTickersError('');
      setTicker(''); // 取引所変更時にティッカーをリセット

      try {
        const response = await fetch(`/api/tickers?exchangeId=${encodeURIComponent(exchange)}`);
        if (!response.ok) {
          throw new Error(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
        }

        const data = await response.json();
        setTickers(data.tickers || []);
      } catch (error) {
        console.error('Error fetching tickers:', error);
        setTickersError(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
      } finally {
        setTickersLoading(false);
      }
    };

    fetchTickers();
  }, [exchange]);

  useEffect(() => {
    if (!ticker) {
      setSummary(null);
      setHolding(null);
      setAlerts([]);
      setSummaryError('');
      setHoldingError('');
      setAlertsError('');
      return;
    }

    const fetchTickerData = async () => {
      setSummaryLoading(true);
      setHoldingLoading(true);
      setAlertsLoading(true);
      setSummaryError('');
      setHoldingError('');
      setAlertsError('');

      const summaryPromise = fetch(`/api/summaries/${ticker}`).then(async (response) => {
        if (!response.ok) {
          throw new Error(ERROR_MESSAGES.FETCH_SUMMARY_ERROR);
        }
        return (await response.json()) as TickerSummary;
      });

      const holdingPromise = fetchHoldingByTicker(ticker);
      const alertsPromise = fetchAlertsByTicker(ticker);

      try {
        const [summaryResult, holdingResult, alertsResult] = await Promise.allSettled([
          summaryPromise,
          holdingPromise,
          alertsPromise,
        ]);

        if (summaryResult.status === 'fulfilled') {
          setSummary(summaryResult.value);
        } else {
          setSummaryError(ERROR_MESSAGES.FETCH_SUMMARY_ERROR);
        }

        if (holdingResult.status === 'fulfilled') {
          setHolding(holdingResult.value);
        } else {
          setHoldingError(ERROR_MESSAGES.FETCH_HOLDING_ERROR);
        }

        if (alertsResult.status === 'fulfilled') {
          setAlerts(alertsResult.value);
        } else {
          setAlertsError(ERROR_MESSAGES.FETCH_ALERTS_ERROR);
        }
      } finally {
        setSummaryLoading(false);
        setHoldingLoading(false);
        setAlertsLoading(false);
      }
    };

    void fetchTickerData();
  }, [ticker]);

  // URL クエリの exchangeId を初期選択に反映
  useEffect(() => {
    if (initialSelectionAppliedRef.current.exchange) {
      return;
    }
    if (!queryExchangeId || exchanges.length === 0) {
      return;
    }

    const exists = exchanges.some((ex) => ex.exchangeId === queryExchangeId);
    if (exists) {
      setExchange(queryExchangeId);
    }
    initialSelectionAppliedRef.current.exchange = true;
  }, [exchanges, queryExchangeId]);

  // URL クエリの tickerId を初期選択に反映
  useEffect(() => {
    if (initialSelectionAppliedRef.current.ticker) {
      return;
    }
    if (!queryTickerId || !exchange || tickers.length === 0) {
      return;
    }

    const exists = tickers.some((t) => t.tickerId === queryTickerId);
    if (exists) {
      setTicker(queryTickerId);
    }
    initialSelectionAppliedRef.current.ticker = true;
  }, [exchange, tickers, queryTickerId]);

  // イベントハンドラー
  const handleExchangeChange = (event: SelectChangeEvent) => {
    setExchange(event.target.value);
    // 取引所変更時はティッカーをリセット
    setTicker('');
  };

  const handleTickerChange = (event: SelectChangeEvent) => {
    setTicker(event.target.value);
  };

  const handleTimeframeChange = (event: SelectChangeEvent) => {
    setTimeframe(event.target.value as Timeframe);
  };

  const handleBarCountChange = (event: SelectChangeEvent) => {
    setBarCount(Number(event.target.value) as ChartBarCount);
  };

  const handleAutoRefreshToggle = () => {
    setAutoRefresh((prev) => !prev);
  };

  const selectedTickerSymbol = tickers.find((item) => item.tickerId === ticker)?.symbol || ticker;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }} role="main">
      {/* エラーメッセージ表示 */}
      {exchangesError && <ErrorAlert message={exchangesError} />}
      {tickersError && <ErrorAlert message={tickersError} />}

      {/* セレクターグループ */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: '1fr 1fr',
            md: 'repeat(4, 1fr)',
          },
          gap: 2,
          mb: 3,
        }}
        role="region"
        aria-label="チャート設定"
      >
        {/* 取引所選択 */}
        <FormControl fullWidth disabled={exchangesLoading}>
          <InputLabel id="exchange-select-label">取引所選択</InputLabel>
          <Select
            labelId="exchange-select-label"
            id="exchange-select"
            value={exchange}
            label="取引所選択"
            onChange={handleExchangeChange}
            startAdornment={exchangesLoading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
            aria-busy={exchangesLoading}
          >
            <MenuItem value="">
              <em>選択してください</em>
            </MenuItem>
            {exchanges.map((ex) => (
              <MenuItem key={ex.exchangeId} value={ex.exchangeId}>
                {ex.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* ティッカー選択 */}
        <FormControl fullWidth disabled={!exchange || tickersLoading}>
          <InputLabel id="ticker-select-label">ティッカー選択</InputLabel>
          <Select
            labelId="ticker-select-label"
            id="ticker-select"
            value={ticker}
            label="ティッカー選択"
            onChange={handleTickerChange}
            startAdornment={tickersLoading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
            aria-busy={tickersLoading}
            aria-describedby={!exchange ? 'ticker-hint' : undefined}
          >
            <MenuItem value="">
              <em>選択してください</em>
            </MenuItem>
            {tickers.map((t) => (
              <MenuItem key={t.tickerId} value={t.tickerId}>
                {t.symbol} - {t.name}
              </MenuItem>
            ))}
          </Select>
          {!exchange && (
            <span id="ticker-hint" style={{ display: 'none' }}>
              先に取引所を選択してください
            </span>
          )}
        </FormControl>

        {/* 時間枠選択 */}
        <FormControl fullWidth>
          <InputLabel id="timeframe-select-label">時間枠</InputLabel>
          <Select
            labelId="timeframe-select-label"
            id="timeframe-select"
            value={timeframe}
            label="時間枠"
            onChange={handleTimeframeChange}
          >
            {(Object.keys(TIMEFRAME_LABELS) as Timeframe[]).map((key) => (
              <MenuItem key={key} value={key}>
                {TIMEFRAME_LABELS[key]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 表示本数選択 */}
        <FormControl fullWidth>
          <InputLabel id="barcount-select-label">表示本数</InputLabel>
          <Select
            labelId="barcount-select-label"
            id="barcount-select"
            value={String(barCount)}
            label="表示本数"
            onChange={handleBarCountChange}
          >
            {CHART_BAR_COUNTS.map((count) => (
              <MenuItem key={count} value={String(count)}>
                {CHART_BAR_COUNT_LABELS[count]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* チャート表示エリア */}
      <Paper
        elevation={2}
        sx={{
          p: 3,
          minHeight: {
            xs: 400,
            sm: 500,
            md: 600,
          },
        }}
        role="region"
        aria-label="株価チャート"
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Tooltip title={autoRefresh ? '自動更新を停止' : '自動更新を開始'}>
            <IconButton
              onClick={handleAutoRefreshToggle}
              color={autoRefresh ? 'primary' : 'default'}
              aria-label="自動更新"
              aria-pressed={autoRefresh}
            >
              {autoRefresh ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
          </Tooltip>
        </Box>
        {ticker ? (
          <StockChart
            tickerId={ticker}
            timeframe={timeframe}
            count={barCount}
            autoRefresh={autoRefresh}
            holdingPrice={holding?.averagePrice}
            alertLines={alertLines}
          />
        ) : (
          <EmptyState
            title="チャート表示エリア"
            description="取引所とティッカーを選択してください"
            minHeight={{
              xs: 400,
              sm: 500,
              md: 600,
            }}
          />
        )}
      </Paper>

      {exchange && ticker && (
        <Box
          sx={{
            mt: 3,
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(3, 1fr)',
            },
          }}
        >
          <TickerSummaryCard
            summary={summary}
            loading={summaryLoading}
            error={summaryError}
            onChanged={refreshHoldingAndAlerts}
          />
          <HoldingCard
            holding={holding}
            tickerId={ticker}
            symbol={selectedTickerSymbol}
            exchangeId={exchange}
            loading={holdingLoading}
            error={holdingError}
            onChanged={refreshHoldingAndAlerts}
          />
          <TickerAlertListCard
            alerts={alerts}
            tickerId={ticker}
            symbol={selectedTickerSymbol}
            exchangeId={exchange}
            loading={alertsLoading}
            error={alertsError}
            onChanged={refreshHoldingAndAlerts}
          />
        </Box>
      )}

      {/* クイックアクションエリア */}
      {children}
    </Container>
  );
}
