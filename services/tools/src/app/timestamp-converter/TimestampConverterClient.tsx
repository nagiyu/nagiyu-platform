'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { writeToClipboard } from '@nagiyu/browser';
import {
  convertDateTimeToUnixTimestamp,
  convertUnixMillisecondsToDateTime,
  convertUnixSecondsToDateTime,
  STOCK_TRACKER_TIMEZONE_OPTIONS,
  TimestampConversionResult,
} from '@/lib/timestamp';
import { SnackbarState } from '@/types/tools';

const DEFAULT_TIMEZONE = 'Asia/Tokyo';
type ErrorField = 'unixSeconds' | 'unixMilliseconds' | 'dateTime' | null;

export default function TimestampConverterClient() {
  const [timeZone, setTimeZone] = useState<string>(DEFAULT_TIMEZONE);
  const [unixSecondsInput, setUnixSecondsInput] = useState<string>('');
  const [unixMillisecondsInput, setUnixMillisecondsInput] = useState<string>('');
  const [dateTimeInput, setDateTimeInput] = useState<string>('');
  const [result, setResult] = useState<TimestampConversionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ErrorField>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showSnackbar = (message: string, severity: SnackbarState['severity']) => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  };

  const applyResult = (nextResult: TimestampConversionResult) => {
    setResult(nextResult);
    setErrorMessage(null);
    setErrorField(null);
  };

  const handleConvertSeconds = () => {
    try {
      applyResult(convertUnixSecondsToDateTime(unixSecondsInput, timeZone));
      showSnackbar('Unix秒を日時に変換しました', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '変換に失敗しました。';
      setErrorMessage(message);
      setErrorField('unixSeconds');
      showSnackbar(message, 'error');
    }
  };

  const handleConvertMilliseconds = () => {
    try {
      applyResult(convertUnixMillisecondsToDateTime(unixMillisecondsInput, timeZone));
      showSnackbar('Unixミリ秒を日時に変換しました', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '変換に失敗しました。';
      setErrorMessage(message);
      setErrorField('unixMilliseconds');
      showSnackbar(message, 'error');
    }
  };

  const handleConvertDateTime = () => {
    try {
      applyResult(convertDateTimeToUnixTimestamp(dateTimeInput, timeZone));
      showSnackbar('日時をUnixタイムスタンプに変換しました', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '変換に失敗しました。';
      setErrorMessage(message);
      setErrorField('dateTime');
      showSnackbar(message, 'error');
    }
  };

  const handleCopy = async () => {
    if (!result) {
      return;
    }

    const copyText = [
      `タイムゾーン: ${result.timeZone}`,
      `日時: ${result.dateTimeInTimeZone}`,
      `UTC (ISO 8601): ${result.isoUtc}`,
      `Unix秒: ${result.unixSeconds}`,
      `Unixミリ秒: ${result.unixMilliseconds}`,
    ].join('\n');

    try {
      await writeToClipboard(copyText);
      showSnackbar('変換結果をクリップボードにコピーしました', 'success');
    } catch {
      showSnackbar('コピーに失敗しました', 'error');
    }
  };

  const handleClear = () => {
    setUnixSecondsInput('');
    setUnixMillisecondsInput('');
    setDateTimeInput('');
    setResult(null);
    setErrorMessage(null);
    setErrorField(null);
  };

  const handleSnackbarClose = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const hasAnyInput = Boolean(unixSecondsInput || unixMillisecondsInput || dateTimeInput || result);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        タイムスタンプ変換ツール
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph align="center">
        Unixタイムスタンプ（秒/ミリ秒）と日時文字列を相互変換できます。
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph align="center">
        タイムゾーンは Stock Tracker で利用している取引所設定に合わせています。日時入力は
        YYYY-MM-DDTHH:mm または YYYY-MM-DDTHH:mm:ss 形式をサポートします。
      </Typography>

      <Box sx={{ mb: 3 }}>
        <TextField
          select
          fullWidth
          label="タイムゾーン"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
        >
          {STOCK_TRACKER_TIMEZONE_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          label="Unix タイムスタンプ（秒）"
          placeholder="例: 1700000000"
          value={unixSecondsInput}
          onChange={(event) => setUnixSecondsInput(event.target.value)}
          error={errorField === 'unixSeconds'}
          helperText={errorField === 'unixSeconds' ? errorMessage : ''}
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          onClick={handleConvertSeconds}
          disabled={!unixSecondsInput.trim()}
          aria-label="Unix秒を日時に変換する"
        >
          秒を日時に変換
        </Button>
      </Box>

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          label="Unix タイムスタンプ（ミリ秒）"
          placeholder="例: 1700000000000"
          value={unixMillisecondsInput}
          onChange={(event) => setUnixMillisecondsInput(event.target.value)}
          error={errorField === 'unixMilliseconds'}
          helperText={errorField === 'unixMilliseconds' ? errorMessage : ''}
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          onClick={handleConvertMilliseconds}
          disabled={!unixMillisecondsInput.trim()}
          aria-label="Unixミリ秒を日時に変換する"
        >
          ミリ秒を日時に変換
        </Button>
      </Box>

      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          label="日時文字列"
          placeholder="例: 2026-03-15T12:34:56"
          value={dateTimeInput}
          onChange={(event) => setDateTimeInput(event.target.value)}
          error={errorField === 'dateTime'}
          helperText={errorField === 'dateTime' ? errorMessage : ''}
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          onClick={handleConvertDateTime}
          disabled={!dateTimeInput.trim()}
          aria-label="日時をUnixタイムスタンプに変換する"
        >
          日時をUnixに変換
        </Button>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          変換結果
        </Typography>
        <Stack spacing={2}>
          <TextField
            fullWidth
            label="日時（選択タイムゾーン）"
            value={result?.dateTimeInTimeZone ?? ''}
            slotProps={{ input: { readOnly: true } }}
          />
          <TextField
            fullWidth
            label="UTC（ISO 8601）"
            value={result?.isoUtc ?? ''}
            slotProps={{ input: { readOnly: true } }}
          />
          <TextField
            fullWidth
            label="Unix タイムスタンプ（秒）"
            value={result ? String(result.unixSeconds) : ''}
            slotProps={{ input: { readOnly: true } }}
          />
          <TextField
            fullWidth
            label="Unix タイムスタンプ（ミリ秒）"
            value={result ? String(result.unixMilliseconds) : ''}
            slotProps={{ input: { readOnly: true } }}
          />
        </Stack>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Button
          variant="contained"
          startIcon={<ContentCopyIcon />}
          onClick={handleCopy}
          disabled={!result}
          aria-label="変換結果をコピーする"
        >
          結果をコピー
        </Button>
        <Button
          variant="outlined"
          startIcon={<ClearIcon />}
          onClick={handleClear}
          disabled={!hasAnyInput}
          aria-label="入力と出力をクリアする"
        >
          クリア
        </Button>
      </Stack>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
