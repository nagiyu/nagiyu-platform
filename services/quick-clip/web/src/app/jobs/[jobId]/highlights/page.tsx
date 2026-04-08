'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
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
import ReplayIcon from '@mui/icons-material/Replay';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type { Highlight } from '@/types/quick-clip';

const ERROR_MESSAGES = {
  LOAD_FAILED: '見どころ一覧の取得に失敗しました',
  UPDATE_FAILED: '見どころの更新に失敗しました',
  RANGE_INVALID: '開始時刻は終了時刻より小さくしてください',
  REGENERATE_FAILED: 'クリップの再生成に失敗しました',
  DOWNLOAD_FAILED: 'ダウンロードの開始に失敗しました',
  NO_HIGHLIGHTS: '見どころが検出されませんでした',
} as const;
const HIGHLIGHT_SOURCE_LABELS = {
  motion: 'モーション',
  volume: '音量',
  emotion: '感情',
  both: '両方',
} as const;
const HIGHLIGHT_STATUS_LABELS = {
  unconfirmed: '未確認',
  accepted: '使える',
  rejected: '使えない',
} as const;
const HIGHLIGHT_STATUS_COLORS: Record<
  'unconfirmed' | 'accepted' | 'rejected',
  'default' | 'success' | 'error'
> = {
  unconfirmed: 'default',
  accepted: 'success',
  rejected: 'error',
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

const ZIP_POLL_INTERVAL_MS = 3000;
const ZIP_POLL_TIMEOUT_MS = 300000;

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
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [clipUrls, setClipUrls] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

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
        setClipUrls((current) => {
          const updated = { ...current };
          let changed = false;
          data.highlights.forEach((highlight) => {
            if (
              highlight.clipStatus === 'GENERATED' &&
              highlight.clipUrl &&
              !current[highlight.highlightId]
            ) {
              updated[highlight.highlightId] = highlight.clipUrl;
              changed = true;
            } else if (highlight.clipStatus !== 'GENERATED' && current[highlight.highlightId]) {
              delete updated[highlight.highlightId];
              changed = true;
            }
          });
          return changed ? updated : current;
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

    void fetchHighlights({ isInitialLoad: true });
  }, [fetchHighlights, jobId]);

  const selectedHighlight = useMemo(() => {
    const highlight = highlights.find((item) => item.highlightId === selectedId);
    if (!highlight) {
      return null;
    }
    return { ...highlight, clipUrl: clipUrls[highlight.highlightId] };
  }, [clipUrls, highlights, selectedId]);

  const hasPendingOrGenerating = useMemo(
    () =>
      highlights.some(
        (highlight) => highlight.clipStatus === 'PENDING' || highlight.clipStatus === 'GENERATING'
      ),
    [highlights]
  );

  useEffect(() => {
    if (!jobId || !hasPendingOrGenerating) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchHighlights({ skipIfFetching: true });
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchHighlights, hasPendingOrGenerating, jobId]);

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
      status?: 'accepted' | 'rejected' | 'unconfirmed';
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

    if (updated.clipStatus !== 'GENERATED') {
      setClipUrls((current) => {
        if (!current[updated.highlightId]) return current;
        const next = { ...current };
        delete next[updated.highlightId];
        return next;
      });
    }
  };

  const onChangeStatus = async (
    highlight: Highlight,
    status: 'accepted' | 'rejected' | 'unconfirmed'
  ) => {
    try {
      await updateHighlight(highlight.highlightId, { status });
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
      const postResponse = await fetch(`/api/jobs/${jobId}/download`, {
        method: 'POST',
      });

      if (!postResponse.ok && postResponse.status !== 202) {
        throw new Error(ERROR_MESSAGES.DOWNLOAD_FAILED);
      }

      const startTime = Date.now();
      while (true) {
        if (Date.now() - startTime > ZIP_POLL_TIMEOUT_MS) {
          throw new Error(ERROR_MESSAGES.DOWNLOAD_FAILED);
        }

        await new Promise((resolve) => setTimeout(resolve, ZIP_POLL_INTERVAL_MS));

        const getResponse = await fetch(`/api/jobs/${jobId}/download`);

        if (getResponse.status === 200) {
          const data = (await getResponse.json()) as DownloadResponse;
          const link = document.createElement('a');
          link.href = data.downloadUrl;
          link.download = data.fileName;
          link.click();
          link.remove();
          setErrorMessage(null);
          return;
        }

        if (getResponse.status !== 202) {
          throw new Error(ERROR_MESSAGES.DOWNLOAD_FAILED);
        }
      }
    } catch {
      setErrorMessage(ERROR_MESSAGES.DOWNLOAD_FAILED);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Paper sx={{ p: 3 }}>
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
          <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
            {/* 左パネル: ディテール */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {!selectedHighlight ? (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 300,
                    border: '1px dashed',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Typography color="text.secondary">クリップを選択してください</Typography>
                </Box>
              ) : (
                <Stack spacing={2}>
                  {/* クリッププレビュー */}
                  {selectedHighlight.clipStatus === 'GENERATED' && (
                    <video
                      key={selectedHighlight.highlightId}
                      controls
                      aria-label="見どころ動画プレビュー"
                      src={selectedHighlight.clipUrl}
                      style={{ width: '100%' }}
                    >
                      お使いのブラウザは video 要素に対応していません。
                    </video>
                  )}
                  {(selectedHighlight.clipStatus === 'PENDING' ||
                    selectedHighlight.clipStatus === 'GENERATING') && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 200,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CircularProgress size={20} />
                        <Typography>クリップ生成中...</Typography>
                      </Stack>
                    </Box>
                  )}
                  {selectedHighlight.clipStatus === 'FAILED' && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 200,
                        border: '1px solid',
                        borderColor: 'error.main',
                        borderRadius: 1,
                        color: 'error.main',
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <ErrorOutlineIcon />
                        <Typography>クリップ生成に失敗しました</Typography>
                      </Stack>
                    </Box>
                  )}

                  {/* クリップ情報 */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      #{selectedHighlight.order} |{' '}
                      {HIGHLIGHT_SOURCE_LABELS[selectedHighlight.source]}
                    </Typography>
                  </Box>

                  {/* 採否ステータス */}
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      採否ステータス:
                    </Typography>
                    <RadioGroup
                      row
                      value={selectedHighlight.status}
                      onChange={(event) => {
                        const val = event.target.value;
                        if (val !== 'unconfirmed' && val !== 'accepted' && val !== 'rejected') {
                          return;
                        }
                        void onChangeStatus(selectedHighlight, val);
                      }}
                    >
                      <FormControlLabel
                        value="unconfirmed"
                        control={<Radio size="small" />}
                        label="未確認"
                      />
                      <FormControlLabel
                        value="accepted"
                        control={<Radio size="small" />}
                        label="使える"
                      />
                      <FormControlLabel
                        value="rejected"
                        control={<Radio size="small" />}
                        label="使えない"
                      />
                    </RadioGroup>
                  </Box>

                  {/* 時間調整 */}
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        開始(秒):
                      </Typography>
                      <TimeInput
                        value={selectedHighlight.startSec}
                        min={0}
                        onCommit={(value) => onUpdateRange(selectedHighlight, 'startSec', value)}
                      />
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        終了(秒):
                      </Typography>
                      <TimeInput
                        value={selectedHighlight.endSec}
                        min={1}
                        onCommit={(value) => onUpdateRange(selectedHighlight, 'endSec', value)}
                      />
                    </Box>
                  </Stack>

                  {/* リトライボタン (FAILED 時のみ) */}
                  {selectedHighlight.clipStatus === 'FAILED' && (
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<ReplayIcon />}
                      onClick={() => void onRegenerate(selectedHighlight)}
                    >
                      リトライ
                    </Button>
                  )}
                </Stack>
              )}
            </Box>

            {/* 右パネル: マスター一覧 */}
            <Box sx={{ width: 400, flexShrink: 0 }}>
              <Stack spacing={2}>
                <TableContainer
                  component={Paper}
                  variant="outlined"
                  sx={{ maxHeight: 480, overflow: 'auto' }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>No.</TableCell>
                        <TableCell>開始〜終了(秒)</TableCell>
                        <TableCell>採否</TableCell>
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
                            {highlight.startSec}〜{highlight.endSec}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Chip
                                label={HIGHLIGHT_STATUS_LABELS[highlight.status]}
                                size="small"
                                color={HIGHLIGHT_STATUS_COLORS[highlight.status]}
                              />
                              {highlight.clipStatus === 'GENERATING' && (
                                <CircularProgress size={12} />
                              )}
                              {highlight.clipStatus === 'FAILED' && (
                                <ErrorOutlineIcon fontSize="small" color="error" />
                              )}
                            </Stack>
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
            </Box>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
