'use client';

import { useState } from 'react';
import {
  Container,
  Box,
  Typography,
  Alert,
  Card,
  CardContent,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { Button, Chip, ErrorAlert, TextField } from '@nagiyu/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useRouter } from 'next/navigation';
import VideoSearchModal from '@/components/VideoSearchModal';
import { ERROR_MESSAGES, VALIDATION_LIMITS } from '@/lib/constants/errors';
import { normalizeVideoIdInput, summarizeInvalidIds } from '@/lib/video-id-input';

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

/**
 * サーバーが形式不正と判定した動画 ID の一覧。多いときは先頭の数件と残りの件数だけ示す。
 */
function InvalidIdList({ ids }: { ids: string[] }) {
  const { shown, remaining } = summarizeInvalidIds(
    ids,
    VALIDATION_LIMITS.INVALID_VIDEO_IDS_DISPLAY_COUNT
  );
  return (
    <Typography variant="body2" sx={{ mt: 1, wordBreak: 'break-all' }}>
      {ERROR_MESSAGES.INVALID_VIDEO_IDS_LABEL}: {shown.join(', ')}
      {remaining > 0 &&
        ` ${ERROR_MESSAGES.INVALID_VIDEO_IDS_REMAINING_PREFIX} ${remaining} ${ERROR_MESSAGES.INVALID_VIDEO_IDS_REMAINING_SUFFIX}`}
    </Typography>
  );
}

export default function ImportPage() {
  const router = useRouter();
  const [videoIds, setVideoIds] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalidIds, setInvalidIds] = useState<string[]>([]);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setInvalidIds([]);
    setResult(null);

    try {
      const ids = normalizeVideoIdInput(videoIds);

      if (ids.length === 0) {
        setError(ERROR_MESSAGES.IMPORT_VIDEO_IDS_REQUIRED);
        setLoading(false);
        return;
      }

      if (ids.length > 100) {
        setError(ERROR_MESSAGES.VIDEO_IDS_TOO_MANY);
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
        if (Array.isArray(errorData.invalidIds)) {
          setInvalidIds(errorData.invalidIds.map(String));
        }
        throw new Error(errorData.error || ERROR_MESSAGES.IMPORT_FAILED);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.GENERIC_ERROR);
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
          ニコニコ動画の動画 ID（sm9, so12345, nm98765 など）または動画の URL
          を入力してください。大文字でも貼り付けられます。
          <br />
          改行、カンマ、読点、スペース区切りで複数指定できます（最大 100 件）。
        </Typography>

        <Box sx={{ mt: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={10}
            placeholder="sm9&#10;so12345&#10;nm98765"
            value={videoIds}
            onChange={(e) => setVideoIds(e.target.value)}
            disabled={loading}
          />
        </Box>

        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Button variant="outline" size="lg" onClick={() => setSearchModalOpen(true)}>
            動画を検索して追加
          </Button>
          <Button
            variant="solid"
            size="lg"
            onClick={handleImport}
            loading={loading}
            disabled={!videoIds.trim()}
          >
            {loading ? <CircularProgress size={24} /> : 'インポート実行'}
          </Button>
        </Box>

        {error && (
          <Box sx={{ mt: 3 }}>
            <ErrorAlert message={error} />
            {invalidIds.length > 0 && <InvalidIdList ids={invalidIds} />}
          </Box>
        )}

        {result && (
          <Box sx={{ mt: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  インポート結果
                </Typography>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                  <Chip>{`合計: ${result.total} 件`}</Chip>
                  <Chip color="success">{`成功: ${result.success} 件`}</Chip>
                  <Chip color="warning">{`スキップ: ${result.skipped} 件`}</Chip>
                  <Chip color="danger">{`失敗: ${result.failed} 件`}</Chip>
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
                  <ErrorAlert message={`${result.failed} 件の動画のインポートに失敗しました`} />
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
                              slotProps={{
                                primary: { sx: { fontWeight: 'medium' } },
                                secondary: { sx: { color: 'error' } },
                              }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </AccordionDetails>
                  </Accordion>
                )}

                <Box sx={{ mt: 2 }}>
                  <Button variant="outline" onClick={() => router.push('/mylist')}>
                    動画一覧を見る
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>
      <VideoSearchModal open={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
    </Container>
  );
}
