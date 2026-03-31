'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { Highlight } from '@/types/quick-clip';

const ERROR_MESSAGES = {
  LOAD_FAILED: '見どころ一覧の取得に失敗しました',
  UPDATE_FAILED: '見どころの更新に失敗しました',
  DOWNLOAD_FAILED: 'ダウンロードの開始に失敗しました',
  NO_HIGHLIGHTS: '見どころが検出されませんでした',
} as const;

type HighlightsPageProps = {
  params: Promise<{ jobId: string }>;
};

type HighlightsResponse = {
  highlights: Highlight[];
  sourceVideoUrl: string;
};

type DownloadResponse = {
  jobId: string;
  fileName: string;
  downloadUrl: string;
};

export default function HighlightsPage({ params }: HighlightsPageProps) {
  const [jobId, setJobId] = useState<string>('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string>('');
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let active = true;
    params.then((resolved) => {
      if (!active) {
        return;
      }
      setJobId((current) => (current === resolved.jobId ? current : resolved.jobId));
    });
    return () => {
      active = false;
    };
  }, [params]);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let active = true;

    const fetchHighlights = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/highlights`);
        if (!response.ok) {
          setErrorMessage(ERROR_MESSAGES.LOAD_FAILED);
          setIsLoading(false);
          return;
        }

        const data = (await response.json()) as HighlightsResponse;
        if (!active) {
          return;
        }

        setHighlights(data.highlights);
        setSelectedId(data.highlights[0]?.highlightId ?? null);
        setSourceVideoUrl(data.sourceVideoUrl);
        setErrorMessage(null);
      } catch {
        if (active) {
          setErrorMessage(ERROR_MESSAGES.LOAD_FAILED);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void fetchHighlights();

    return () => {
      active = false;
    };
  }, [jobId]);

  const selectedHighlight = useMemo(
    () => highlights.find((highlight) => highlight.highlightId === selectedId) ?? null,
    [highlights, selectedId]
  );

  useEffect(() => {
    if (!previewRef.current) {
      return;
    }

    const preview = previewRef.current;
    if (!sourceVideoUrl || !selectedHighlight) {
      preview.removeAttribute('src');
      preview.load();
      return;
    }

    preview.src = sourceVideoUrl;
    const seekToStart = () => {
      preview.currentTime = selectedHighlight.startSec;
      preview.removeEventListener('loadedmetadata', seekToStart);
    };
    preview.addEventListener('loadedmetadata', seekToStart);
    preview.load();
    return () => {
      preview.removeEventListener('loadedmetadata', seekToStart);
    };
  }, [selectedHighlight, sourceVideoUrl]);

  useEffect(() => {
    if (!previewRef.current || !selectedHighlight) {
      return;
    }

    const preview = previewRef.current;
    const clampToRange = () => {
      if (preview.currentTime < selectedHighlight.startSec) {
        preview.currentTime = selectedHighlight.startSec;
        return;
      }
      if (preview.currentTime >= selectedHighlight.endSec) {
        if (preview.currentTime > selectedHighlight.endSec) {
          preview.currentTime = selectedHighlight.endSec;
        }
        preview.pause();
        return;
      }
    };
    preview.addEventListener('timeupdate', clampToRange);
    preview.addEventListener('seeking', clampToRange);
    return () => {
      preview.removeEventListener('timeupdate', clampToRange);
      preview.removeEventListener('seeking', clampToRange);
    };
  }, [selectedHighlight]);

  const acceptedCount = useMemo(
    () => highlights.filter((highlight) => highlight.status === 'accepted').length,
    [highlights]
  );

  const updateHighlight = async (
    highlightId: string,
    values: {
      startSec?: number;
      endSec?: number;
      status?: 'accepted' | 'rejected' | 'pending';
    }
  ): Promise<void> => {
    const response = await fetch(`/api/jobs/${jobId}/highlights/${highlightId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      throw new Error(ERROR_MESSAGES.UPDATE_FAILED);
    }

    const updated = (await response.json()) as Highlight;

    setHighlights((current) =>
      current.map((highlight) =>
        highlight.highlightId === updated.highlightId ? updated : highlight
      )
    );
  };

  const onToggleAccepted = async (highlight: Highlight, checked: boolean) => {
    try {
      await updateHighlight(highlight.highlightId, {
        status: checked ? 'accepted' : 'rejected',
      });
      setErrorMessage(null);
    } catch {
      setErrorMessage(ERROR_MESSAGES.UPDATE_FAILED);
    }
  };

  const onUpdateRange = async (
    highlight: Highlight,
    field: 'startSec' | 'endSec',
    value: string
  ): Promise<void> => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return;
    }

    const startSec = field === 'startSec' ? parsed : highlight.startSec;
    const endSec = field === 'endSec' ? parsed : highlight.endSec;

    if (startSec >= endSec) {
      return;
    }

    try {
      await updateHighlight(highlight.highlightId, {
        startSec,
        endSec,
      });
      setErrorMessage(null);
    } catch {
      setErrorMessage(ERROR_MESSAGES.UPDATE_FAILED);
    }
  };

  const onDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/download`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.DOWNLOAD_FAILED);
      }

      const data = (await response.json()) as DownloadResponse;
      const link = document.createElement('a');
      link.href = data.downloadUrl;
      link.download = data.fileName;
      link.click();
      link.remove();
      setErrorMessage(null);
    } catch {
      setErrorMessage(ERROR_MESSAGES.DOWNLOAD_FAILED);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          見どころ確認画面
        </Typography>

        {isLoading && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <CircularProgress size={20} />
            <Typography>見どころを取得しています...</Typography>
          </Stack>
        )}

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        )}

        {!isLoading && highlights.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {ERROR_MESSAGES.NO_HIGHLIGHTS}
          </Alert>
        )}

        {highlights.length > 0 && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                動画プレビュー
              </Typography>
              <video
                ref={previewRef}
                controls
                aria-label="見どころ動画プレビュー"
                style={{ width: '100%' }}
              >
                お使いのブラウザは video 要素に対応していません。
              </video>
              {selectedHighlight && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  選択中: #{selectedHighlight.order} ({selectedHighlight.startSec}s -{' '}
                  {selectedHighlight.endSec}s)
                </Typography>
              )}
            </Box>

            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>No.</TableCell>
                    <TableCell>開始〜終了(秒)</TableCell>
                    <TableCell>使える</TableCell>
                    <TableCell>開始調整</TableCell>
                    <TableCell>終了調整</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {highlights.map((highlight) => (
                    <TableRow
                      key={highlight.highlightId}
                      hover
                      selected={highlight.highlightId === selectedId}
                      onClick={() => setSelectedId(highlight.highlightId)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>#{highlight.order}</TableCell>
                      <TableCell>
                        {highlight.startSec}s〜{highlight.endSec}s
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={highlight.status === 'accepted'}
                          onChange={(event) => onToggleAccepted(highlight, event.target.checked)}
                          inputProps={{ 'aria-label': `見どころ${highlight.order}を使えるにする` }}
                        />
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <TextField
                          size="small"
                          type="number"
                          value={highlight.startSec}
                          inputProps={{ min: 0, step: 1 }}
                          onChange={(event) =>
                            void onUpdateRange(highlight, 'startSec', event.target.value)
                          }
                        />
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <TextField
                          size="small"
                          type="number"
                          value={highlight.endSec}
                          inputProps={{ min: 1, step: 1 }}
                          onChange={(event) =>
                            void onUpdateRange(highlight, 'endSec', event.target.value)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="body2" color="text.secondary">
              採用中の見どころ: {acceptedCount} 件
            </Typography>

            <Button
              variant="contained"
              onClick={onDownload}
              disabled={acceptedCount === 0 || isDownloading}
            >
              {isDownloading ? 'ダウンロード準備中...' : 'ZIP ダウンロード'}
            </Button>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
