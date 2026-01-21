'use client';

import { useState } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
} from '@mui/material';
import { useRouter } from 'next/navigation';

interface ImportResult {
  success: Array<{ videoId: string; title: string }>;
  skipped: Array<{ videoId: string; reason: string }>;
  failed: Array<{ videoId: string; error: string }>;
}

export default function ImportPage() {
  const router = useRouter();
  const [videoIds, setVideoIds] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 動画 ID を抽出（改行、カンマ、スペース区切り対応）
      const ids = videoIds
        .split(/[\n,\s]+/)
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (ids.length === 0) {
        setError('動画 ID を入力してください');
        setLoading(false);
        return;
      }

      if (ids.length > 100) {
        setError('一度に登録できる動画は最大 100 件です');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/videos/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoIds: ids }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'インポートに失敗しました');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          動画一括インポート
        </Typography>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          ニコニコ動画の動画 ID（sm[数字]）を入力してください。
          <br />
          改行、カンマ、スペース区切りで複数指定できます（最大 100 件）。
        </Typography>

        <Box sx={{ mt: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={10}
            placeholder="sm9&#10;sm10&#10;sm11"
            value={videoIds}
            onChange={(e) => setVideoIds(e.target.value)}
            disabled={loading}
          />
        </Box>

        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            size="large"
            onClick={handleImport}
            disabled={loading || !videoIds.trim()}
          >
            {loading ? <CircularProgress size={24} /> : 'インポート実行'}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 3 }}>
            {error}
          </Alert>
        )}

        {result && (
          <Box sx={{ mt: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  インポート結果
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <Chip label={`成功: ${result.success.length} 件`} color="success" />
                  <Chip label={`スキップ: ${result.skipped.length} 件`} color="warning" />
                  <Chip label={`失敗: ${result.failed.length} 件`} color="error" />
                </Box>

                {result.success.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      成功
                    </Typography>
                    <List dense>
                      {result.success.map((item) => (
                        <ListItem key={item.videoId}>
                          <ListItemText primary={item.title} secondary={item.videoId} />
                        </ListItem>
                      ))}
                    </List>
                  </>
                )}

                {result.skipped.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      スキップ
                    </Typography>
                    <List dense>
                      {result.skipped.map((item) => (
                        <ListItem key={item.videoId}>
                          <ListItemText primary={item.videoId} secondary={item.reason} />
                        </ListItem>
                      ))}
                    </List>
                  </>
                )}

                {result.failed.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      失敗
                    </Typography>
                    <List dense>
                      {result.failed.map((item) => (
                        <ListItem key={item.videoId}>
                          <ListItemText primary={item.videoId} secondary={item.error} />
                        </ListItem>
                      ))}
                    </List>
                  </>
                )}

                <Box sx={{ mt: 2 }}>
                  <Button variant="outlined" onClick={() => router.push('/videos')}>
                    動画一覧を見る
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>
    </Container>
  );
}
