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
  Chip,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useRouter } from 'next/navigation';

interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  total: number;
  failedDetails?: Array<{
    videoId: string;
    error: string;
  }>;
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

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                  <Chip label={`合計: ${result.total} 件`} color="default" />
                  <Chip label={`成功: ${result.success} 件`} color="success" />
                  <Chip label={`スキップ: ${result.skipped} 件`} color="warning" />
                  <Chip label={`失敗: ${result.failed} 件`} color="error" />
                </Box>

                {result.success > 0 && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    {result.success} 件の動画を正常にインポートしました
                  </Alert>
                )}

                {result.skipped > 0 && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    {result.skipped} 件の動画は既に登録済みのためスキップされました
                  </Alert>
                )}

                {result.failed > 0 && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {result.failed} 件の動画のインポートに失敗しました
                  </Alert>
                )}

                {result.failedDetails && result.failedDetails.length > 0 && (
                  <Accordion sx={{ mb: 2 }}>
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      aria-controls="failed-details-content"
                      id="failed-details-header"
                    >
                      <Typography>失敗した動画の詳細を表示</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <List dense>
                        {result.failedDetails.map((item, index) => (
                          <ListItem
                            key={index}
                            sx={{ flexDirection: 'column', alignItems: 'flex-start' }}
                          >
                            <ListItemText
                              primary={`動画ID: ${item.videoId}`}
                              secondary={`エラー: ${item.error}`}
                              primaryTypographyProps={{ fontWeight: 'medium' }}
                              secondaryTypographyProps={{ color: 'error' }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </AccordionDetails>
                  </Accordion>
                )}

                <Box sx={{ mt: 2 }}>
                  <Button variant="outlined" onClick={() => router.push('/')}>
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
