'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
  RANGE_INVALID: '開始時刻は終了時刻より小さくしてください',
  REGENERATE_FAILED: 'クリップの再生成に失敗しました',
  DOWNLOAD_FAILED: 'ダウンロードの開始に失敗しました',
  NO_HIGHLIGHTS: '見どころが検出されませんでした',
} as const;
const CLIP_STATUS_LABELS = {
  PENDING: '未生成',
  GENERATING: '生成中',
  GENERATED: '生成完了',
  FAILED: '生成失敗',
} as const;
const HIGHLIGHT_SOURCE_LABELS = {
  motion: 'モーション',
  volume: '音量',
  both: '両方',
} as const;

type HighlightsPageProps = {
  params: Promise<{ jobId: string }>;
};

type HighlightsResponse = {
  highlights: Array<Highlight & { clipUrl?: string }>;
};

type DownloadResponse = {
  jobId: string;
  fileName: string;
  downloadUrl: string;
};

class RangeInvalidError extends Error {}

type TimeInputProps = {
  value: number;
  min?: number;
  onCommit: (value: number) => Promise<void>;
};

function TimeInput({ value, min = 0, onCommit }: TimeInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const handleBlur = async (): Promise<void> => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < min) {
      setDraft(String(value));
      return;
    }

    try {
      await onCommit(parsed);
    } catch {
      setDraft(String(value));
    }
  };

  return (
    <TextField
      size="small"
      type="number"
      value={draft}
      inputProps={{ min, step: 1 }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void handleBlur()}
    />
  );
}

export default function HighlightsPage({ params }: HighlightsPageProps) {
  const [jobId, setJobId] = useState<string>('');
  const [highlights, setHighlights] = useState<Array<Highlight & { clipUrl?: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const selectionTimeoutRef = useRef<number | null>(null);

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

  const fetchHighlights = useCallback(
    async (options?: { isInitialLoad?: boolean; skipIfFetching?: boolean }) => {
      const isInitialLoad = options?.isInitialLoad ?? false;
      const skipIfFetching = options?.skipIfFetching ?? false;
      if (!jobId) {
        return;
      }
      if (skipIfFetching && isFetchingRef.current) {
        return;
      }
      isFetchingRef.current = true;
      try {
        const response = await fetch(`/api/jobs/${jobId}/highlights`);
        if (!response.ok) {
          setErrorMessage(ERROR_MESSAGES.LOAD_FAILED);
          return;
        }

        const data = (await response.json()) as HighlightsResponse;
        setHighlights(data.highlights);
        setSelectedId((current) => {
          if (
            current &&
            data.highlights.some(
              (highlight) =>
                highlight.highlightId === current && highlight.clipStatus === 'GENERATED'
            )
          ) {
            return current;
          }
          return (
            data.highlights.find((highlight) => highlight.clipStatus === 'GENERATED')
              ?.highlightId ?? null
          );
        });
        setErrorMessage(null);
      } catch {
        setErrorMessage(ERROR_MESSAGES.LOAD_FAILED);
      } finally {
        isFetchingRef.current = false;
        if (isInitialLoad) {
          setIsLoading(false);
        }
      }
    },
    [jobId]
  );

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let active = true;

    void fetchHighlights({ isInitialLoad: true });

    return () => {
      active = false;
    };
  }, [fetchHighlights, jobId]);

  const selectedHighlight = useMemo(
    () => highlights.find((highlight) => highlight.highlightId === selectedId) ?? null,
    [highlights, selectedId]
  );

  const hasGenerating = useMemo(
    () => highlights.some((highlight) => highlight.clipStatus === 'GENERATING'),
    [highlights]
  );

  useEffect(() => {
    if (!jobId || !hasGenerating) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchHighlights({ skipIfFetching: true });
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchHighlights, hasGenerating, jobId]);

  useEffect(() => {
    return () => {
      if (selectionTimeoutRef.current !== null) {
        window.clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, []);

  const onSelectHighlight = useCallback((highlightId: string) => {
    if (selectionTimeoutRef.current !== null) {
      window.clearTimeout(selectionTimeoutRef.current);
    }

    selectionTimeoutRef.current = window.setTimeout(() => {
      setSelectedId(highlightId);
      selectionTimeoutRef.current = null;
    }, 200);
  }, []);

  const acceptedCount = useMemo(
    () => highlights.filter((highlight) => highlight.status === 'accepted').length,
    [highlights]
  );
  const hasUngeneratedAcceptedClip = useMemo(
    () =>
      highlights.some(
        (highlight) => highlight.status === 'accepted' && highlight.clipStatus !== 'GENERATED'
      ),
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
    value: number
  ): Promise<void> => {
    const startSec = field === 'startSec' ? value : highlight.startSec;
    const endSec = field === 'endSec' ? value : highlight.endSec;

    if (startSec >= endSec) {
      setErrorMessage(ERROR_MESSAGES.RANGE_INVALID);
      throw new RangeInvalidError(ERROR_MESSAGES.RANGE_INVALID);
    }

    try {
      await updateHighlight(highlight.highlightId, {
        startSec,
        endSec,
      });
      if (selectedId === highlight.highlightId) {
        setSelectedId(null);
      }
      setErrorMessage(null);
    } catch (error) {
      if (!(error instanceof RangeInvalidError)) {
        setErrorMessage(ERROR_MESSAGES.UPDATE_FAILED);
      }
      throw error;
    }
  };

  const onRegenerate = async (highlight: Highlight): Promise<void> => {
    try {
      const response = await fetch(
        `/api/jobs/${jobId}/highlights/${highlight.highlightId}/regenerate`,
        {
          method: 'POST',
        }
      );
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.REGENERATE_FAILED);
      }
      const updated = (await response.json()) as Highlight;
      setHighlights((current) =>
        current.map((item) => (item.highlightId === updated.highlightId ? updated : item))
      );
      setErrorMessage(null);
    } catch {
      setErrorMessage(ERROR_MESSAGES.REGENERATE_FAILED);
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
                クリッププレビュー
              </Typography>
              <video
                key={selectedHighlight?.highlightId ?? 'no-selection'}
                controls
                aria-label="見どころ動画プレビュー"
                src={selectedHighlight?.clipUrl}
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
              {!selectedHighlight && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  クリップ生成中のため、生成完了までお待ちください。
                </Typography>
              )}
            </Box>

            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>No.</TableCell>
                    <TableCell>開始〜終了(秒)</TableCell>
                    <TableCell>根拠</TableCell>
                    <TableCell>使える</TableCell>
                    <TableCell>開始調整</TableCell>
                    <TableCell>終了調整</TableCell>
                    <TableCell>再生成</TableCell>
                    <TableCell>生成状態</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {highlights.map((highlight) => (
                    <TableRow
                      key={highlight.highlightId}
                      hover
                      selected={highlight.highlightId === selectedId}
                      onClick={() => {
                        if (highlight.clipStatus === 'GENERATED') {
                          onSelectHighlight(highlight.highlightId);
                        }
                      }}
                      sx={{ cursor: highlight.clipStatus === 'GENERATED' ? 'pointer' : 'default' }}
                    >
                      <TableCell>#{highlight.order}</TableCell>
                      <TableCell>
                        {highlight.startSec}s〜{highlight.endSec}s
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={HIGHLIGHT_SOURCE_LABELS[highlight.source]}
                          size="small"
                          color={highlight.source === 'both' ? 'primary' : 'default'}
                        />
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={highlight.status === 'accepted'}
                          onChange={(event) => onToggleAccepted(highlight, event.target.checked)}
                          inputProps={{ 'aria-label': `見どころ${highlight.order}を使えるにする` }}
                        />
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <TimeInput
                          value={highlight.startSec}
                          min={0}
                          onCommit={(value) => onUpdateRange(highlight, 'startSec', value)}
                        />
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <TimeInput
                          value={highlight.endSec}
                          min={1}
                          onCommit={(value) => onUpdateRange(highlight, 'endSec', value)}
                        />
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        {highlight.clipStatus === 'GENERATING' ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CircularProgress size={16} />
                            <Typography variant="body2">再生成中</Typography>
                          </Stack>
                        ) : (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => void onRegenerate(highlight)}
                            disabled={
                              highlight.clipStatus !== 'PENDING' &&
                              highlight.clipStatus !== 'FAILED'
                            }
                          >
                            再生成
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {highlight.clipStatus === 'GENERATING' ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CircularProgress size={16} />
                            <Typography variant="body2">生成中</Typography>
                          </Stack>
                        ) : (
                          CLIP_STATUS_LABELS[highlight.clipStatus]
                        )}
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
              disabled={acceptedCount === 0 || hasUngeneratedAcceptedClip || isDownloading}
            >
              {isDownloading ? 'ダウンロード準備中...' : 'ZIP ダウンロード'}
            </Button>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
