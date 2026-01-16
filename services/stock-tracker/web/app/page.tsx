'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Typography,
  SelectChangeEvent,
  CircularProgress,
  Alert,
} from '@mui/material';
import type { Timeframe, TradingSession } from '@/types/stock';
import { TIMEFRAME_LABELS, TRADING_SESSION_LABELS } from '@/types/stock';

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
  FETCH_EXCHANGES_ERROR: '取引所一覧の取得に失敗しました',
  FETCH_TICKERS_ERROR: 'ティッカー一覧の取得に失敗しました',
} as const;

export default function Home() {
  // 選択状態の管理
  const [exchange, setExchange] = useState<string>('');
  const [ticker, setTicker] = useState<string>('');
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [session, setSession] = useState<TradingSession>('regular');

  // データ状態の管理
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);

  // ローディング状態の管理
  const [exchangesLoading, setExchangesLoading] = useState<boolean>(false);
  const [tickersLoading, setTickersLoading] = useState<boolean>(false);

  // エラー状態の管理
  const [exchangesError, setExchangesError] = useState<string>('');
  const [tickersError, setTickersError] = useState<string>('');

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
      return;
    }

    const fetchTickers = async () => {
      setTickersLoading(true);
      setTickersError('');

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

  const handleSessionChange = (event: SelectChangeEvent) => {
    setSession(event.target.value as TradingSession);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* エラーメッセージ表示 */}
      {exchangesError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {exchangesError}
        </Alert>
      )}
      {tickersError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {tickersError}
        </Alert>
      )}

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
            startAdornment={
              exchangesLoading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null
            }
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
            startAdornment={
              tickersLoading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null
            }
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

        {/* セッション選択 */}
        <FormControl fullWidth>
          <InputLabel id="session-select-label">セッション</InputLabel>
          <Select
            labelId="session-select-label"
            id="session-select"
            value={session}
            label="セッション"
            onChange={handleSessionChange}
          >
            {(Object.keys(TRADING_SESSION_LABELS) as TradingSession[]).map((key) => (
              <MenuItem key={key} value={key}>
                {TRADING_SESSION_LABELS[key]}
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
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
        }}
      >
        <Typography variant="h5" color="text.secondary" gutterBottom>
          チャート表示エリア
        </Typography>
        <Typography variant="body1" color="text.secondary" align="center" sx={{ mt: 2 }}>
          ECharts によるローソク足チャート
        </Typography>
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            • ローソク足表示
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • X軸: 日時
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • Y軸: 価格
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • ズーム/パン操作対応
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • ツールチップ表示（ホバー/タップ時に価格情報表示）
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
