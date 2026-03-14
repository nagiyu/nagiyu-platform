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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import { writeToClipboard } from '@nagiyu/browser';
import { generateVapidKeys, VapidKeyPair } from '@/lib/vapid';
import { SnackbarState } from '@/types/tools';

export default function VapidGeneratorPage() {
  const [keys, setKeys] = useState<VapidKeyPair | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
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
    try {
      setIsGenerating(true);
      const generated = await generateVapidKeys();
      setKeys(generated);
      showSnackbar('VAPIDキーを生成しました', 'success');
    } catch (error) {
      showSnackbar(
        error instanceof Error ? error.message : 'VAPIDキーの生成に失敗しました。',
        'error'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await writeToClipboard(value);
      showSnackbar('クリップボードにコピーしました', 'success');
    } catch {
      showSnackbar('コピーに失敗しました', 'error');
    }
  };

  const handleSnackbarClose = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        VAPID キー生成ツール
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph align="center">
        Web Push 通知で利用する VAPID の公開鍵・秘密鍵ペアを生成します。
      </Typography>

      <Typography variant="body2" color="text.secondary" paragraph>
        生成される鍵は Base64url 形式です。
        <br />
        公開鍵はクライアント側、秘密鍵はサーバー側で安全に保管してください。
      </Typography>

      <Box sx={{ mb: 3, mt: 3 }}>
        <Button
          variant="contained"
          startIcon={<AutorenewIcon />}
          onClick={handleGenerate}
          disabled={isGenerating}
          aria-label="VAPIDキーを生成する"
        >
          {isGenerating ? '生成中...' : 'VAPIDキーを生成'}
        </Button>
      </Box>

      <Stack spacing={3}>
        <Box>
          <Typography variant="subtitle1" gutterBottom>
            公開鍵（Public Key）
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            value={keys?.publicKey ?? ''}
            placeholder="生成後に公開鍵が表示されます"
            slotProps={{ input: { readOnly: true } }}
            sx={{ mb: 1.5 }}
          />
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={() => keys && handleCopy(keys.publicKey)}
            disabled={!keys?.publicKey}
            aria-label="公開鍵をコピーする"
          >
            公開鍵をコピー
          </Button>
        </Box>

        <Box>
          <Typography variant="subtitle1" gutterBottom>
            秘密鍵（Private Key）
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            value={keys?.privateKey ?? ''}
            placeholder="生成後に秘密鍵が表示されます"
            slotProps={{ input: { readOnly: true } }}
            sx={{ mb: 1.5 }}
          />
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={() => keys && handleCopy(keys.privateKey)}
            disabled={!keys?.privateKey}
            aria-label="秘密鍵をコピーする"
          >
            秘密鍵をコピー
          </Button>
        </Box>
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
