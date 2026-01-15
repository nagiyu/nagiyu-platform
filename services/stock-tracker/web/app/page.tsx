'use client';

import { useState } from 'react';
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
} from '@mui/material';
import type { Timeframe, TradingSession } from '@/types/stock';
import { TIMEFRAME_LABELS, TRADING_SESSION_LABELS } from '@/types/stock';

export default function Home() {
  // 選択状態の管理
  const [exchange, setExchange] = useState<string>('');
  const [ticker, setTicker] = useState<string>('');
  const [timeframe, setTimeframe] = useState<Timeframe>('1d');
  const [session, setSession] = useState<TradingSession>('regular');

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
        <FormControl fullWidth>
          <InputLabel id="exchange-select-label">取引所選択</InputLabel>
          <Select
            labelId="exchange-select-label"
            id="exchange-select"
            value={exchange}
            label="取引所選択"
            onChange={handleExchangeChange}
          >
            <MenuItem value="">
              <em>選択してください</em>
            </MenuItem>
            <MenuItem value="NYSE">NYSE</MenuItem>
            <MenuItem value="NASDAQ">NASDAQ</MenuItem>
            <MenuItem value="TSE">東京証券取引所</MenuItem>
          </Select>
        </FormControl>

        {/* ティッカー選択 */}
        <FormControl fullWidth disabled={!exchange}>
          <InputLabel id="ticker-select-label">ティッカー選択</InputLabel>
          <Select
            labelId="ticker-select-label"
            id="ticker-select"
            value={ticker}
            label="ティッカー選択"
            onChange={handleTickerChange}
          >
            <MenuItem value="">
              <em>選択してください</em>
            </MenuItem>
            {exchange && (
              <>
                <MenuItem value="AAPL">AAPL - Apple Inc.</MenuItem>
                <MenuItem value="GOOGL">GOOGL - Alphabet Inc.</MenuItem>
                <MenuItem value="MSFT">MSFT - Microsoft Corporation</MenuItem>
              </>
            )}
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
