'use client';

import { useState } from 'react';
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Snackbar,
  Alert,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ClearIcon from '@mui/icons-material/Clear';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { SnackbarState } from '@/types/tools';
import { formatJson, minifyJson } from '@/lib/formatters/jsonFormatter';
import { readFromClipboard, writeToClipboard } from '@nagiyu/browser';

export default function JsonFormatterClient() {
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const handleFormat = () => {
    setError(null);

    // 整形処理（バリデーション含む）
    const result = formatJson(inputText);
    if (!result.isValid) {
      setError(result.error || '');
      setSnackbar({
        open: true,
        message: result.error || '整形に失敗しました',
        severity: 'error',
      });
      return;
    }

    setOutputText(result.formatted);
    setSnackbar({
      open: true,
      message: '整形が完了しました',
      severity: 'success',
    });
  };

  const handleMinify = () => {
    setError(null);

    // 圧縮処理（バリデーション含む）
    const result = minifyJson(inputText);
    if (!result.isValid) {
      setError(result.error || '');
      setSnackbar({
        open: true,
        message: result.error || '圧縮に失敗しました',
        severity: 'error',
      });
      return;
    }

    setOutputText(result.formatted);
    setSnackbar({
      open: true,
      message: '圧縮が完了しました',
      severity: 'success',
    });
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
        JSON 整形ツール
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph align="center">
        JSON の整形・圧縮・検証ができます
      </Typography>

      {/* 使い方ガイド */}
      <Box sx={{ mb: 4 }}>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6" component="h3">
              📖 使い方ガイド
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 1 }}>
              ステップ1: JSON を入力
            </Typography>
            <Typography variant="body2" paragraph>
              入力欄に JSON 文字列を貼り付けます。「クリップボードから読み取り」ボタンを使うと、
              クリップボード内の JSON をそのまま入力できます。
            </Typography>

            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 2 }}>
              ステップ2: 整形または圧縮を選ぶ
            </Typography>
            <Typography variant="body2" paragraph>
              「整形」はインデント付きで見やすく表示したいときに使用します。
              「圧縮」は改行や空白を削除し、1行のコンパクトな JSON にしたいときに使用します。
            </Typography>

            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 2 }}>
              ステップ3: 結果を確認してコピー
            </Typography>
            <Typography variant="body2" paragraph>
              出力欄に変換結果が表示されます。「コピー」ボタンで結果をクリップボードに保存し、
              ドキュメントやチャット、設定ファイルの編集にそのまま利用できます。
            </Typography>

            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
              💡 主なユースケース
            </Typography>
            <Box component="ul" sx={{ pl: 3, mb: 2 }}>
              <Box component="li" sx={{ mb: 1 }}>
                <Typography variant="body2">
                  API レスポンスの可読性を上げ、キー構造を確認しやすくする
                </Typography>
              </Box>
              <Box component="li" sx={{ mb: 1 }}>
                <Typography variant="body2">
                  共有用に JSON を圧縮し、ログやメッセージに貼り付けやすくする
                </Typography>
              </Box>
              <Box component="li" sx={{ mb: 1 }}>
                <Typography variant="body2">
                  JSON の文法エラーを検出し、入力ミスを早期に見つける
                </Typography>
              </Box>
            </Box>

            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 2 }}>
              ❓ FAQ
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Q. データはサーバーに送信されますか？</strong>
              <br />
              A. いいえ。変換処理はブラウザ内で完結するため、入力した JSON は外部に送信されません。
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Q. 整形時のインデント幅は変更できますか？</strong>
              <br />
              A. 現在は 2 スペース固定です。一般的な JSON 表示形式として読みやすさを優先しています。
            </Typography>
            <Typography variant="body2">
              <strong>Q. 無効な JSON を入力した場合はどうなりますか？</strong>
              <br />
              A.
              エラーメッセージを表示し、整形・圧縮処理を停止します。入力内容を修正して再実行してください。
            </Typography>
          </AccordionDetails>
        </Accordion>
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
          label="JSON 文字列"
          placeholder="JSON を入力してください..."
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
            aria-label="クリップボードから JSON を読み取る"
          >
            クリップボードから読み取り
          </Button>
          <Button
            variant="contained"
            onClick={handleFormat}
            disabled={!inputText.trim()}
            aria-label="JSON を整形する"
          >
            整形
          </Button>
          <Button
            variant="contained"
            onClick={handleMinify}
            disabled={!inputText.trim()}
            aria-label="JSON を圧縮する"
          >
            圧縮
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
          label="結果"
          placeholder="整形・圧縮された結果がここに表示されます..."
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

      {/* Snackbar */}
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
