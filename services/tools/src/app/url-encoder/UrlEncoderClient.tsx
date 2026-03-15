'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import { readFromClipboard, writeToClipboard } from '@nagiyu/browser';
import { decodeUrl, encodeUrl } from '@/lib/url-encoder';
import { SnackbarState } from '@/types/tools';

type Mode = 'encode' | 'decode';

export default function UrlEncoderClient() {
  const [mode, setMode] = useState<Mode>('encode');
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
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

  const handleConvert = () => {
    setError(null);

    try {
      const result = mode === 'encode' ? encodeUrl(inputText) : decodeUrl(inputText);
      setOutputText(result);
      showSnackbar(mode === 'encode' ? 'URLエンコードしました' : 'URLデコードしました', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '変換に失敗しました。';
      setError(message);
      showSnackbar(message, 'error');
    }
  };

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    setOutputText('');
    setError(null);
  };

  const handleReadClipboard = async () => {
    try {
      const text = await readFromClipboard();
      setInputText(text);
      setError(null);
      showSnackbar('クリップボードから読み取りました', 'success');
    } catch (err) {
      showSnackbar(
        err instanceof Error ? err.message : 'クリップボードの読み取りに失敗しました',
        'error'
      );
    }
  };

  const handleCopy = async () => {
    try {
      await writeToClipboard(outputText);
      showSnackbar('クリップボードにコピーしました', 'success');
    } catch {
      showSnackbar('コピーに失敗しました', 'error');
    }
  };

  const handleClear = () => {
    setInputText('');
    setOutputText('');
    setError(null);
  };

  const handleSnackbarClose = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        URL エンコーダー / デコーダー
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph align="center">
        URLの文字列をエンコード・デコードできます。
      </Typography>

      <Box sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2}>
          <Button
            variant={mode === 'encode' ? 'contained' : 'outlined'}
            onClick={() => handleModeChange('encode')}
            aria-label="エンコードモードに切り替える"
          >
            エンコード
          </Button>
          <Button
            variant={mode === 'decode' ? 'contained' : 'outlined'}
            onClick={() => handleModeChange('decode')}
            aria-label="デコードモードに切り替える"
          >
            デコード
          </Button>
        </Stack>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          入力
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={8}
          label={mode === 'encode' ? 'テキスト' : 'URLエンコード文字列'}
          placeholder={
            mode === 'encode'
              ? 'エンコードする文字列を入力してください...'
              : 'デコードするURLエンコード文字列を入力してください...'
          }
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
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
            aria-label="クリップボードから入力を読み取る"
          >
            クリップボードから読み取り
          </Button>
          <Button
            variant="contained"
            onClick={handleConvert}
            disabled={!inputText.trim()}
            aria-label={
              mode === 'encode' ? '入力をURLエンコードする' : '入力をURLエンコードからデコードする'
            }
          >
            {mode === 'encode' ? 'エンコード' : 'デコード'}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          出力
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={8}
          label="結果"
          placeholder="変換結果がここに表示されます..."
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
            aria-label="結果をクリップボードにコピーする"
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
