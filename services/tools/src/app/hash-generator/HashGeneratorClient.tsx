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
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import { readFromClipboard, writeToClipboard } from '@nagiyu/browser';
import { generateHash, HASH_ALGORITHMS, HashAlgorithm } from '@/lib/hash';
import { SnackbarState } from '@/types/tools';

export default function HashGeneratorClient() {
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>('SHA-256');
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

  const handleGenerate = async () => {
    setError(null);

    try {
      const result = await generateHash(inputText, algorithm);
      setOutputText(result);
      showSnackbar('ハッシュを生成しました', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ハッシュ生成に失敗しました。';
      setError(message);
      showSnackbar(message, 'error');
    }
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
        ハッシュ生成ツール
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph align="center">
        テキストから SHA-256 / SHA-512 のハッシュ値（Hex）を生成できます。
      </Typography>

      <Box sx={{ mb: 3 }}>
        <TextField
          select
          fullWidth
          label="アルゴリズム"
          value={algorithm}
          onChange={(event) => setAlgorithm(event.target.value as HashAlgorithm)}
        >
          {HASH_ALGORITHMS.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          入力
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={8}
          label="テキスト"
          placeholder="ハッシュ化する文字列を入力してください..."
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
            onClick={handleGenerate}
            disabled={!inputText.trim()}
            aria-label="入力文字列のハッシュを生成する"
          >
            ハッシュ生成
          </Button>
        </Stack>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          出力（Hex）
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={6}
          label="ハッシュ値"
          placeholder="生成結果がここに表示されます..."
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
