'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import SyncIcon from '@mui/icons-material/Sync';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { SnackbarState, DisplaySettings, DEFAULT_DISPLAY_SETTINGS } from '@/types/tools';
import {
  parseTransitText,
  validateInput,
} from '@/lib/parsers/transitParser';
import { formatTransitRoute } from '@/lib/formatters/formatters';
import { readFromClipboard, writeToClipboard } from '@/lib/clipboard';
import DisplaySettingsSection from '@/components/tools/DisplaySettingsSection';

const STORAGE_KEY = 'transit-converter-display-settings';

export default function TransitConverterPage() {
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(
    DEFAULT_DISPLAY_SETTINGS,
  );
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  // LocalStorageから設定を読み込む
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load display settings from localStorage:', error);
      // エラーが発生してもデフォルト設定で続行
    }
  }, []);

  // 設定変更時にLocalStorageに保存
  const handleDisplaySettingsChange = (newSettings: DisplaySettings) => {
    setDisplaySettings(newSettings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.error('Failed to save display settings to localStorage:', error);
      // 保存エラーは無視（プライベートモード等）
    }
  };

  const handleConvert = () => {
    setIsProcessing(true);
    setError(null);

    try {
      // 1. バリデーション
      const validation = validateInput(inputText);
      if (!validation.valid) {
        setError(validation.error || '');
        setSnackbar({
          open: true,
          message: validation.error || '入力エラーが発生しました',
          severity: 'error',
        });
        setIsProcessing(false);
        return;
      }

      // 2. パース処理
      const route = parseTransitText(inputText);
      if (!route) {
        const errorMsg =
          'テキストを解析できませんでした。乗り換え案内のテキストを確認してください。';
        setError(errorMsg);
        setSnackbar({
          open: true,
          message: errorMsg,
          severity: 'error',
        });
        setIsProcessing(false);
        return;
      }

      // 3. フォーマット処理（DisplaySettings適用）
      const formatted = formatTransitRoute(route, displaySettings);
      setOutputText(formatted);
      setError(null);

      setSnackbar({
        open: true,
        message: '変換が完了しました',
        severity: 'success',
      });
    } catch (error) {
      console.error('Transit conversion error:', error);
      const errorMsg = '予期しないエラーが発生しました。';
      setError(errorMsg);
      setSnackbar({
        open: true,
        message: errorMsg,
        severity: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setOutputText('');
    setError(null);
  };

  const handleReadClipboard = async () => {
    try {
      const text = await readFromClipboard();
      setInputText(text);
      setError(null);
      setSnackbar({
        open: true,
        message: 'クリップボードから読み取りました',
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'クリップボードの読み取りに失敗しました',
        severity: 'error',
      });
    }
  };

  const handleCopy = async () => {
    try {
      await writeToClipboard(outputText);
      setSnackbar({
        open: true,
        message: 'クリップボードにコピーしました',
        severity: 'success',
      });
    } catch {
      setSnackbar({
        open: true,
        message: 'コピーに失敗しました',
        severity: 'error',
      });
    }
  };

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        乗り換え変換ツール
      </Typography>

      <Typography
        variant="body1"
        color="text.secondary"
        paragraph
        align="center"
      >
        乗り換え案内のテキストを貼り付けて、整形された形式に変換します。
      </Typography>

      {/* 表示設定セクション */}
      <Box sx={{ mb: 3 }}>
        <DisplaySettingsSection
          settings={displaySettings}
          onChange={handleDisplaySettingsChange}
        />
      </Box>

      {/* 入力セクション */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          入力
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={10}
          label="乗り換え案内テキスト"
          placeholder="乗り換え案内のテキストをここに貼り付けてください..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          error={!!error}
          helperText={error}
          sx={{ mb: 2 }}
        />
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ '& > button': { xs: { width: '100%' }, sm: { width: 'auto' } } }}
        >
          <Button
            variant="outlined"
            startIcon={<ContentPasteIcon />}
            onClick={handleReadClipboard}
            aria-label="クリップボードから乗り換え案内テキストを読み取る"
          >
            クリップボードから読み取り
          </Button>
          <Button
            variant="contained"
            startIcon={
              isProcessing ? <CircularProgress size={20} /> : <SyncIcon />
            }
            onClick={handleConvert}
            disabled={isProcessing || !inputText.trim()}
            aria-label="乗り換え案内テキストを変換する"
          >
            変換
          </Button>
        </Stack>
      </Box>

      {/* 出力セクション */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          出力
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={10}
          label="変換結果"
          placeholder="変換された結果がここに表示されます..."
          value={outputText}
          slotProps={{
            input: {
              readOnly: true,
            },
          }}
          sx={{ mb: 2 }}
        />
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ '& > button': { xs: { width: '100%' }, sm: { width: 'auto' } } }}
        >
          <Button
            variant="contained"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            disabled={!outputText}
            aria-label="変換結果をクリップボードにコピーする"
          >
            コピー
          </Button>
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClear}
            disabled={!inputText && !outputText}
            aria-label="入力と出力をクリアする"
          >
            クリア
          </Button>
        </Stack>
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
